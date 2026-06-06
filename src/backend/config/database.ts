import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const dbPool = mysql.createPool({
	host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
	port: Number(process.env.MYSQLPORT || process.env.DB_PORT) || 3306,
	user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
	password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
	database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'student_management',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

export const testDatabaseConnection = async () => {
	const connection = await dbPool.getConnection();
	try {
		await connection.ping();
		return true;
	} finally {
		connection.release();
	}
};
