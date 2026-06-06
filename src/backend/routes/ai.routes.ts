import { Router } from 'express';
import mysql, { RowDataPacket } from 'mysql2';
import { dbPool } from '../config/database';
import {
	generateStreamingResponse,
	getChatHistory,
	getPotentialStudents,
	markLeadReviewed,
	getOnlineAdminCount,
	getActiveChatSessions,
	saveChatMessage,
	generateEmbedding,
	retrieveRelevantChunks,
	cosineSimilarity,
} from '../services/ai.service';
import { AuthenticatedRequest, readBearerToken, verifyAccessToken } from '../utils/jwt';

const router = Router();

// ──────────────────────────────────────────────
// Middleware xác thực tùy chọn (AI routes không bắt buộc đăng nhập)
// ──────────────────────────────────────────────
const optionalAuth = (req: AuthenticatedRequest, res: any, next: () => void) => {
	try {
		const token = readBearerToken(req.headers.authorization);
		if (token) {
			req.user = verifyAccessToken(token);
		}
	} catch {
		// Không có token hợp lệ — cho phép chat ẩn danh
	}
	next();
};

// ──────────────────────────────────────────────
// POST /api/ai/chat/stream — Chat streaming qua SSE
// ──────────────────────────────────────────────
router.post('/chat/stream', optionalAuth, async (req: AuthenticatedRequest, res) => {
	const { session_id, message } = req.body as { session_id?: string; message?: string };

	if (!message?.trim()) {
		res.status(400).json({ success: false, message: 'Tin nhắn không được trống' });
		return;
	}

	const sessionId = session_id || `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const userId = req.user?.id;

	// Lưu tin nhắn user
	await saveChatMessage(sessionId, 'user', message, userId).catch(() => {});

	// Đặt headers SSE
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no');
	res.flushHeaders();

	// Gửi session_id về client để lưu lại
	res.write(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`);

	try {
		const stream = generateStreamingResponse(sessionId, message, userId);

		for await (const chunk of stream) {
			if (res.writableEnded) break;
			res.write(`data: ${chunk}\n\n`);
		}
	} catch (error) {
		console.error('[AI Route] Streaming error:', error);
		if (!res.writableEnded) {
			res.write(`data: ${JSON.stringify({ status: 'error', message: 'Đã xảy ra lỗi khi xử lý yêu cầu' })}\n\n`);
		}
	} finally {
		if (!res.writableEnded) {
			res.write(`data: ${JSON.stringify({ status: 'done' })}\n\n`);
			res.end();
		}
	}
});

// ──────────────────────────────────────────────
// GET /api/ai/history/:session_id — Lấy lịch sử hội thoại
// ──────────────────────────────────────────────
router.get('/history/:session_id', optionalAuth, async (req, res) => {
	const sessionId = req.params.session_id as string;

	if (!sessionId) {
		res.status(400).json({ success: false, message: 'Thiếu session_id' });
		return;
	}

	try {
		const history = await getChatHistory(sessionId, 20);
		res.json({
			success: true,
			data: { sessionId, messages: history },
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Không thể lấy lịch sử hội thoại',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

// ──────────────────────────────────────────────
// GET /api/ai/leads — Lấy danh sách thí sinh tiềm năng (chỉ admin)
// ──────────────────────────────────────────────
router.get('/leads', async (req: AuthenticatedRequest, res) => {
	try {
		const token = readBearerToken(req.headers.authorization);
		if (!token) {
			res.status(401).json({ success: false, message: 'Thiếu access token' });
			return;
		}
		const user = verifyAccessToken(token);
		if (user.role !== 'manager') {
			res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được xem danh sách leads' });
			return;
		}

		const page = Number(req.query.page) || 1;
		const limit = Number(req.query.limit) || 20;
		const reviewed = req.query.reviewed === 'true' ? true : req.query.reviewed === 'false' ? false : undefined;

		const result = await getPotentialStudents(page, limit, reviewed);
		res.json({
			success: true,
			data: result.data,
			total: result.total,
			page,
			limit,
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Không thể lấy danh sách leads',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

// ──────────────────────────────────────────────
// PATCH /api/ai/leads/:id/review — Đánh dấu lead đã xem
// ──────────────────────────────────────────────
router.patch('/leads/:id/review', async (req: AuthenticatedRequest, res) => {
	try {
		const token = readBearerToken(req.headers.authorization);
		if (!token) {
			res.status(401).json({ success: false, message: 'Thiếu access token' });
			return;
		}
		const user = verifyAccessToken(token);
		if (user.role !== 'manager') {
			res.status(403).json({ success: false, message: 'Không có quyền' });
			return;
		}

		const id = Number(req.params.id);
		if (!id) {
			res.status(400).json({ success: false, message: 'ID không hợp lệ' });
			return;
		}

		await markLeadReviewed(id, user.id);
		res.json({ success: true, message: 'Đã đánh dấu đã xem' });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Không thể cập nhật',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

// ──────────────────────────────────────────────
// GET /api/ai/admins/online — Lấy số admin đang online
// ──────────────────────────────────────────────
router.get('/admins/online', async (req, res) => {
	try {
		const count = await getOnlineAdminCount();
		res.json({ success: true, online_count: count });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Không thể kiểm tra trạng thái admin',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

// ──────────────────────────────────────────────
// GET /api/ai/sessions — Lấy các phiên chat đang hoạt động (chỉ admin)
// ──────────────────────────────────────────────
router.get('/sessions', async (req: AuthenticatedRequest, res) => {
	try {
		const token = readBearerToken(req.headers.authorization);
		if (!token) {
			res.status(401).json({ success: false, message: 'Thiếu access token' });
			return;
		}
		const user = verifyAccessToken(token);
		if (user.role !== 'manager') {
			res.status(403).json({ success: false, message: 'Chỉ quản trị viên mới được xem' });
			return;
		}

		const sessions = await getActiveChatSessions();
		res.json({ success: true, data: sessions });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Không thể lấy danh sách phiên',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

// ──────────────────────────────────────────────
// GET /api/ai/schools — Lấy danh sách các trường được hỗ trợ
// ──────────────────────────────────────────────
router.get('/schools', async (_req, res) => {
	try {
		const [rows] = await dbPool.query<RowDataPacket[]>(
			'SELECT id, name, short_name, description, website, hotline, address FROM schools ORDER BY name',
		);
		res.json({ success: true, data: rows });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Không thể lấy danh sách trường',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

// ──────────────────────────────────────────────
// POST /api/ai/embed/query — Embed một truy vấn (để test RAG)
// ──────────────────────────────────────────────
router.post('/embed/query', async (req, res) => {
	const { text } = req.body as { text?: string };

	if (!text?.trim()) {
		res.status(400).json({ success: false, message: 'Văn bản không được trống' });
		return;
	}

	try {
		const embedding = await generateEmbedding(text);
		const chunks = await retrieveRelevantChunks(embedding, undefined, 3);

		res.json({
			success: true,
			data: {
				embedding_dim: embedding.length,
				chunks: chunks.map((c) => ({
					id: c.id,
					content: c.content,
					source_file: c.source_file,
					score: cosineSimilarity(c.embedding, embedding),
				})),
			},
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: 'Lỗi embedding',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});

export default router;
