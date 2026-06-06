import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export interface UseSocketOptions {
	userId?: number;
	role: 'student' | 'admin';
	sessionId?: string;
	autoConnect?: boolean;
}

export interface UseSocketReturn {
	socket: Socket | null;
	isConnected: boolean;
	onlineAdminCount: number;
	registerStudent: (sessionId: string, userId?: number) => void;
	registerAdmin: (userId: number) => void;
	sendAdminAlert: (payload: HandoffPayload) => void;
	sendAdminReply: (sessionId: string, message: string, fromUserId: number) => void;
	sendStudentMessage: (sessionId: string, message: string, userId?: number) => void;
	sendTyping: (sessionId: string, role: 'student' | 'admin', isTyping: boolean) => void;
	onReceiveMessage: (callback: (msg: ReceiveMessagePayload) => void) => () => void;
	onAdminAlert: (callback: (alert: AdminAlertPayload) => void) => () => void;
	onStudentMessage: (callback: (msg: StudentMessagePayload) => void) => () => void;
	onUserTyping: (callback: (data: { session_id: string; isTyping: boolean }) => void) => () => void;
	onAdminTyping: (callback: (data: { isTyping: boolean }) => void) => () => void;
	onHandoffAck: (callback: (data: { session_id: string; message: string }) => void) => () => void;
	onNoAdmin: (callback: (data: { message: string }) => void) => () => () => void;
	disconnect: () => void;
}

export interface HandoffPayload {
	session_id: string;
	user_id?: number;
	student_name?: string;
	score?: number;
	subject_group?: string;
	target_major?: string;
	chat_history: Array<{ role: string; content: string; timestamp: string }>;
}

export interface ReceiveMessagePayload {
	role: 'admin';
	message: string;
	from_user_id: number;
	timestamp: string;
}

export interface AdminAlertPayload {
	session_id: string;
	user_id?: number;
	student_name?: string;
	score?: number;
	subject_group?: string;
	target_major?: string;
	chat_history: Array<{ role: string; content: string; timestamp: string }>;
	triggered_at: string;
}

export interface StudentMessagePayload {
	session_id: string;
	user_id?: number;
	message: string;
	timestamp: string;
}

export const useSocket = (options: UseSocketOptions): UseSocketReturn => {
	const { userId, role, sessionId, autoConnect = true } = options;
	const socketRef = useRef<Socket | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [onlineAdminCount, setOnlineAdminCount] = useState(0);
	const [socketState, setSocketState] = useState<Socket | null>(null);
	const callbacksRef = useRef<Map<string, Array<(...args: unknown[]) => void>>>(new Map());

	const connect = useCallback(() => {
		if (socketRef.current?.connected) return;

		socketRef.current = io(SOCKET_URL, {
			transports: ['websocket', 'polling'],
			reconnection: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
		});

		socketRef.current.on('connect', () => {
			console.log('[Socket] Connected:', socketRef.current?.id);
			setIsConnected(true);
			setSocketState(socketRef.current);

			if (role === 'admin' && userId) {
				socketRef.current?.emit('register_admin', { userId });
			} else if (role === 'student' && sessionId) {
				socketRef.current?.emit('register_student', { sessionId, userId });
			}
		});

		socketRef.current.on('disconnect', () => {
			console.log('[Socket] Disconnected');
			setIsConnected(false);
		});

		socketRef.current.on('connect_error', (err) => {
			console.error('[Socket] Connection error:', err);
		});

		socketRef.current.on('admin_count_update', (data: { count: number }) => {
			setOnlineAdminCount(data.count);
		});

		// Đăng ký lại khi reconnect
		socketRef.current.on('reconnect', () => {
			setSocketState(socketRef.current);
			if (role === 'admin' && userId) {
				socketRef.current?.emit('register_admin', { userId });
			} else if (role === 'student' && sessionId) {
				socketRef.current?.emit('register_student', { sessionId, userId });
			}
		});
	}, [role, userId, sessionId]);

	useEffect(() => {
		if (autoConnect) {
			connect();
		}

		return () => {
			socketRef.current?.disconnect();
			socketRef.current = null;
			setIsConnected(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const registerStudent = useCallback((newSessionId: string, newUserId?: number) => {
		socketRef.current?.emit('register_student', { sessionId: newSessionId, userId: newUserId });
	}, []);

	const registerAdmin = useCallback((newUserId: number) => {
		socketRef.current?.emit('register_admin', { userId: newUserId });
	}, []);

	const sendAdminAlert = useCallback((payload: HandoffPayload) => {
		socketRef.current?.emit('admin_alert', payload);
	}, []);

	const sendAdminReply = useCallback((newSessionId: string, message: string, fromUserId: number) => {
		socketRef.current?.emit('admin_reply', { session_id: newSessionId, message, from_user_id: fromUserId });
	}, []);

	const sendStudentMessage = useCallback((newSessionId: string, message: string, newUserId?: number) => {
		socketRef.current?.emit('send_to_admin', { session_id: newSessionId, message, user_id: newUserId });
	}, []);

	const sendTyping = useCallback((newSessionId: string, typingRole: 'student' | 'admin', isTyping: boolean) => {
		socketRef.current?.emit('typing', { session_id: newSessionId, role: typingRole, isTyping });
	}, []);

	const onReceiveMessage = useCallback((callback: (msg: ReceiveMessagePayload) => void) => {
		socketRef.current?.on('receive_message', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('receive_message', callback as (...args: unknown[]) => void);
	}, []);

	const onAdminAlert = useCallback((callback: (alert: AdminAlertPayload) => void) => {
		socketRef.current?.on('admin_alert', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('admin_alert', callback as (...args: unknown[]) => void);
	}, []);

	const onStudentMessage = useCallback((callback: (msg: StudentMessagePayload) => void) => {
		socketRef.current?.on('student_message', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('student_message', callback as (...args: unknown[]) => void);
	}, []);

	const onUserTyping = useCallback((callback: (data: { session_id: string; isTyping: boolean }) => void) => {
		socketRef.current?.on('user_typing', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('user_typing', callback as (...args: unknown[]) => void);
	}, []);

	const onAdminTyping = useCallback((callback: (data: { isTyping: boolean }) => void) => {
		socketRef.current?.on('admin_typing', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('admin_typing', callback as (...args: unknown[]) => void);
	}, []);

	const onHandoffAck = useCallback((callback: (data: { session_id: string; message: string }) => void) => {
		socketRef.current?.on('handoff_ack', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('handoff_ack', callback as (...args: unknown[]) => void);
	}, []);

	const onNoAdmin = useCallback((callback: (data: { message: string }) => void) => {
		socketRef.current?.on('no_admin_available', callback as (...args: unknown[]) => void);
		return () => socketRef.current?.off('no_admin_available', callback as (...args: unknown[]) => void);
	}, []);

	const disconnect = useCallback(() => {
		socketRef.current?.disconnect();
		socketRef.current = null;
		setIsConnected(false);
		setSocketState(null);
	}, []);

	return {
		socket: socketState,
		isConnected,
		onlineAdminCount,
		registerStudent,
		registerAdmin,
		sendAdminAlert,
		sendAdminReply,
		sendStudentMessage,
		sendTyping,
		onReceiveMessage,
		onAdminAlert,
		onStudentMessage,
		onUserTyping,
		onAdminTyping,
		onHandoffAck,
		onNoAdmin,
		disconnect,
	};
};
