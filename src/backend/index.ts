import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import databaseRoutes from './routes/database.routes';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import admissionRoutes from './routes/admission.routes';
import aiRoutes from './routes/ai.routes';
import cutoffRoutes from './routes/cutoff.routes';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const allowedOrigins = [
	'http://localhost:8000',
	'http://localhost:3000',
	'http://127.0.0.1:8000',
	'https://*.netlify.app',
	'http://localhost:5173',
];
const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN;
if (railwayUrl) {
	allowedOrigins.push(`https://${railwayUrl}`);
	allowedOrigins.push(`https://${railwayUrl}.up.railway.app`);
}
const io = new SocketIOServer(httpServer, {
	cors: {
		origin: allowedOrigins,
		methods: ['GET', 'POST'],
		credentials: true,
	},
});

const port = process.env.BACKEND_PORT || 5000;

// ──────────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'backend', 'uploads')));

// ──────────────────────────────────────────────
// Các Route REST
// ──────────────────────────────────────────────
app.get('/', (_req, res) => {
	res.json({
		message: 'Backend server đang chạy',
		modules: ['auth', 'admin', 'admission', 'ai'],
	});
});

app.use('/api/database', databaseRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admission', admissionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/cutoff', cutoffRoutes);

// ──────────────────────────────────────────────
// Kiểm tra sức khỏe server
// ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────
// Các sự kiện Socket.IO
// ──────────────────────────────────────────────
interface ConnectedUser {
	socketId: string;
	userId?: number;
	role: 'student' | 'admin';
	sessionId?: string;
}

const connectedUsers = new Map<string, ConnectedUser>();
const adminSockets = new Set<string>();

// Hàm helper: gửi số admin online tới tất cả client
const broadcastOnlineAdmins = () => {
	io.emit('admin_count_update', { count: adminSockets.size });
};

// Helper: tìm các socket của admin
const getAdminSockets = () => Array.from(adminSockets);

io.on('connection', (socket) => {
	console.log(`[Socket.IO] Client connected: ${socket.id}`);

	// ── Đăng ký làm admin ──────────────────────
	socket.on('register_admin', (data: { userId: number }) => {
		connectedUsers.set(socket.id, {
			socketId: socket.id,
			userId: data.userId,
			role: 'admin',
		});
		adminSockets.add(socket.id);
		broadcastOnlineAdmins();
		console.log(`[Socket.IO] Admin registered: userId=${data.userId}, totalAdmins=${adminSockets.size}`);
		socket.emit('registered_admin', { success: true });
	});

	// ── Đăng ký làm sinh viên ───────────────────
	socket.on('register_student', (data: { userId?: number; sessionId: string }) => {
		connectedUsers.set(socket.id, {
			socketId: socket.id,
			userId: data.userId,
			role: 'student',
			sessionId: data.sessionId,
		});
		console.log(`[Socket.IO] Student registered: userId=${data.userId}, sessionId=${data.sessionId}`);
		socket.emit('registered_student', { success: true });
	});

	// ── Admin alert (chuyển giao từ AI) ───────────
	socket.on('admin_alert', (payload: {
		session_id: string;
		user_id?: number;
		student_name?: string;
		score?: number;
		subject_group?: string;
		target_major?: string;
		chat_history: Array<{ role: string; content: string; timestamp: string }>;
	}) => {
		console.log(`[Socket.IO] Handoff alert: session=${payload.session_id}`);

		// Gửi cho tất cả admin online
		const admins = getAdminSockets();
		if (admins.length === 0) {
			// Không có admin online — thông báo cho sinh viên
			socket.emit('no_admin_available', {
				message: 'Hiện không có tư vấn viên trực tuyến. Em vui lòng gửi email tới ptit.edu.vn hoặc gọi hotline để được hỗ trợ nhé.',
			});
			return;
		}

		// Gửi alert cho tất cả admin để bất kỳ ai cũng có thể phản hồi
		for (const targetSocketId of admins) {
			io.to(targetSocketId).emit('admin_alert', {
				session_id: payload.session_id,
				user_id: payload.user_id,
				student_name: payload.student_name,
				score: payload.score,
				subject_group: payload.subject_group,
				target_major: payload.target_major,
				chat_history: payload.chat_history,
				triggered_at: new Date().toISOString(),
			});
		}

		// Xác nhận cho sinh viên biết admin đã được thông báo
		socket.emit('handoff_ack', {
			session_id: payload.session_id,
			message: 'Đã kết nối với tư vấn viên. Vui lòng chờ trong giây lát nhé.',
		});
	});

	// ── Admin phản hồi sinh viên ─────────────────
	socket.on('admin_reply', (payload: {
		session_id: string;
		message: string;
		from_user_id: number;
	}) => {
		console.log(`[Socket.IO] Admin reply: session=${payload.session_id}, message=${payload.message.substring(0, 50)}...`);

		// Tìm socket của sinh viên và gửi tin nhắn
		for (const [, user] of connectedUsers) {
			if (user.sessionId === payload.session_id && user.role === 'student') {
				io.to(user.socketId).emit('receive_message', {
					role: 'admin',
					message: payload.message,
					from_user_id: payload.from_user_id,
					timestamp: new Date().toISOString(),
				});
			}
		}
	});

	// ── Sinh viên gửi tin nhắn cho admin ───────
	socket.on('send_to_admin', (payload: {
		session_id: string;
		message: string;
		user_id?: number;
	}) => {
		const admins = getAdminSockets();
		if (admins.length === 0) {
			socket.emit('no_admin_available', {
				message: 'Hiện không có tư vấn viên trực tuyến.',
			});
			return;
		}

		// Thông báo cho admin về tin nhắn mới
		for (const adminSocketId of admins) {
			io.to(adminSocketId).emit('student_message', {
				session_id: payload.session_id,
				user_id: payload.user_id,
				message: payload.message,
				timestamp: new Date().toISOString(),
			});
		}
	});

	// ── Trạng thái đang gõ ───────────────────────
	socket.on('typing', (data: { session_id: string; role: 'student' | 'admin'; isTyping: boolean }) => {
		const { session_id, role, isTyping } = data;

		if (role === 'student') {
			// Thông báo cho admin khi sinh viên đang gõ
			for (const adminSocketId of adminSockets) {
				io.to(adminSocketId).emit('user_typing', { session_id, isTyping });
			}
		} else {
			// Thông báo cho sinh viên khi admin đang gõ
			for (const [, user] of connectedUsers) {
				if (user.sessionId === session_id && user.role === 'student') {
					io.to(user.socketId).emit('admin_typing', { isTyping });
				}
			}
		}
	});

	// ── Ngắt kết nối ──────────────────────────────
	socket.on('disconnect', () => {
		const user = connectedUsers.get(socket.id);
		if (user) {
			if (user.role === 'admin') {
				adminSockets.delete(socket.id);
				broadcastOnlineAdmins();
				console.log(`[Socket.IO] Admin disconnected: userId=${user.userId}, remaining=${adminSockets.size}`);
			} else {
				console.log(`[Socket.IO] Student disconnected: userId=${user.userId}, sessionId=${user.sessionId}`);
			}
			connectedUsers.delete(socket.id);
		} else {
			console.log(`[Socket.IO] Unknown client disconnected: ${socket.id}`);
		}
	});

	// ── Ping/Pong để giữ kết nối sống ─────────────────
	socket.on('ping_server', () => {
		socket.emit('pong_server');
	});
});

// ──────────────────────────────────────────────
// Khởi động server
// ──────────────────────────────────────────────
httpServer.listen(port, () => {
	console.log(`Backend server đang chạy tại http://localhost:${port}`);
	console.log(`Socket.IO đã sẵn sàng (cổng ${port})`);
});

// ──────────────────────────────────────────────
// Export io để dùng trong routes
// ──────────────────────────────────────────────
export { io };
