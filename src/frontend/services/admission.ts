import axios from 'axios';
import { getToken } from '../utils/auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/admission';

const createAuthorizedConfig = () => ({
	headers: {
		Authorization: `Bearer ${getToken()}`,
	},
});

export const getMyAdmissionApplication = () => {
	return axios.get(`${API_URL}/me`, createAuthorizedConfig());
};

export const savePersonalInfo = (payload: Record<string, unknown>) => {
	return axios.put(`${API_URL}/personal-info`, payload, createAuthorizedConfig());
};

export const saveDocumentsInfo = (payload: Record<string, unknown>) => {
	return axios.put(`${API_URL}/documents`, payload, createAuthorizedConfig());
};

export const uploadAdmissionDocument = (payload: Record<string, unknown>) => {
	return axios.post(`${API_URL}/documents/upload`, payload, createAuthorizedConfig());
};

export const saveAcademicInfo = (payload: Record<string, unknown>) => {
	return axios.put(`${API_URL}/academic-info`, payload, createAuthorizedConfig());
};

export const saveAdmissionWishes = (wishes: Array<Record<string, unknown>>) => {
	return axios.put(
		`${API_URL}/wishes`,
		{
			wishes,
		},
		createAuthorizedConfig(),
	);
};

export const submitAdmissionApplication = (confirmationChecked: boolean) => {
	return axios.post(
		`${API_URL}/submit`,
		{
			confirmationChecked,
		},
		createAuthorizedConfig(),
	);
};

// ── Cutoff scores ───────────────────────────────
const CUTOFF_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/cutoff`;

export const getCutoffScores = (params?: { university_id?: number; year?: number; combination_id?: number }) => {
	return axios.get(CUTOFF_URL, { params });
};

export const getCutoffUniversities = () => {
	return axios.get(`${CUTOFF_URL}/universities`);
};

export const getCutoffYears = () => {
	return axios.get(`${CUTOFF_URL}/years`);
};

export const getCutoffCombinations = () => {
	return axios.get(`${CUTOFF_URL}/combinations`);
};
