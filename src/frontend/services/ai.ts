import request from 'umi-request';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const getToken = () => localStorage.getItem('token');

// ──────────────────────────────────────────────
// Các kiểu dữ liệu
// ──────────────────────────────────────────────
export interface ChatMessage {
	role: 'user' | 'assistant' | 'admin' | 'system';
	content: string;
	timestamp: string;
	id?: string;
}

export interface PotentialLead {
	id: number;
	session_id: string | null;
	user_id: number | null;
	student_name: string | null;
	score: number | null;
	subject_group: string | null;
	target_major: string | null;
	phone: string | null;
	email: string | null;
	notes: string | null;
	reviewed: boolean;
	reviewed_by: number | null;
	reviewed_at: string | null;
	created_at: string;
}

// ──────────────────────────────────────────────
// 1. Chat streaming
// ──────────────────────────────────────────────
export const streamChat = (
	message: string,
	sessionId: string,
	onChunk: (data: AIStreamChunk) => void,
	onError?: (err: Error) => void,
): { abort: () => void } => {
	const token = getToken();
	const controller = new AbortController();

	fetch(`${API_BASE}/api/ai/chat/stream`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ message, session_id: sessionId }),
		signal: controller.signal,
	})
		.then((res) => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const reader = res.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let buffer = '';

			const read = () => {
				reader.read().then(({ done, value }) => {
					if (done) {
						if (buffer.trim()) {
							try {
								onChunk(JSON.parse(buffer.trim()));
							} catch {
								// bỏ qua
							}
						}
						return;
					}

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						const raw = line.replace(/^data: /, '');
						if (raw.trim()) {
							try {
								onChunk(JSON.parse(raw.trim()));
							} catch {
								// bỏ qua partial JSON
							}
						}
					}

					if (!controller.signal.aborted) {
						read();
					}
				}).catch((err) => {
					if (err.name !== 'AbortError') {
						onError?.(err);
					}
				});
			};

			read();
		})
		.catch((err) => {
			if (err.name !== 'AbortError') {
				onError?.(err);
			}
		});

	return {
		abort: () => controller.abort(),
	};
};

// ──────────────────────────────────────────────
// 2. Lấy lịch sử hội thoại
// ──────────────────────────────────────────────
export const getChatHistory = (sessionId: string) => {
	const token = getToken();
	return request<{ success: boolean; data: { session_id: string; messages: ChatMessage[] } }>(
		`${API_BASE}/api/ai/history/${sessionId}`,
		{
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		},
	);
};

// ──────────────────────────────────────────────
// 3. Lấy danh sách thí sinh tiềm năng
// ──────────────────────────────────────────────
export const getPotentialLeads = (page = 1, limit = 20, reviewed?: boolean) => {
	const token = getToken() || '';
	return request<{ success: boolean; data: PotentialLead[]; total: number }>(
		`${API_BASE}/api/ai/leads`,
		{
			headers: { Authorization: `Bearer ${token}` },
			params: { page, limit, ...(reviewed !== undefined ? { reviewed: String(reviewed) } : {}) },
		},
	);
};

// ──────────────────────────────────────────────
// 4. Đánh dấu lead đã xem
// ──────────────────────────────────────────────
export const markLeadReviewed = (id: number) => {
	const token = getToken() || '';
	return request(`${API_BASE}/api/ai/leads/${id}/review`, {
		method: 'PATCH',
		headers: { Authorization: `Bearer ${token}` },
	});
};

// ──────────────────────────────────────────────
// 5. Lấy số admin đang online
// ──────────────────────────────────────────────
export const getOnlineAdminCount = () => {
	return request<{ success: boolean; online_count: number }>(
		`${API_BASE}/api/ai/admins/online`,
	);
};

// ──────────────────────────────────────────────
// 6. Lấy các phiên chat đang hoạt động (admin)
// ──────────────────────────────────────────────
export const getActiveSessions = () => {
	const token = getToken() || '';
	return request<{
		success: boolean;
		data: Array<{ session_id: string; user_id: number | null; last_message: string; last_message_at: string }>;
	}>(
		`${API_BASE}/api/ai/sessions`,
		{
			headers: { Authorization: `Bearer ${token}` },
		},
	);
};

// ──────────────────────────────────────────────
// 7. Embed truy vấn (test RAG)
// ──────────────────────────────────────────────
export const embedQuery = (text: string) => {
	return request(`${API_BASE}/api/ai/embed/query`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: { text },
	});
};

// ──────────────────────────────────────────────
// 8. Lấy danh sách các trường được hỗ trợ
// ──────────────────────────────────────────────
export interface School {
	id: string;
	name: string;
	short_name: string;
	description: string | null;
	website: string | null;
	hotline: string | null;
	address: string | null;
}

export const getSchools = () => {
	return request<{ success: boolean; data: School[] }>(`${API_BASE}/api/ai/schools`);
};

// ──────────────────────────────────────────────
// Kiểu chunk nội bộ
// ──────────────────────────────────────────────
export interface AIStreamChunk {
	session_id?: string;
	token?: string;
	status?: 'handoff' | 'done' | 'error';
	trigger_socket?: boolean;
	message?: string;
	ner_data?: {
		student_name?: string;
		score?: number;
		subject_group?: string;
		target_major?: string;
	};
}
