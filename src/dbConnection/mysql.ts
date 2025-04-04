import mysql from 'mysql2';

export const dbConnection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password:  'password',
    database: 'fileMetaData'
});

// Connect to MySQL
dbConnection.connect((err:any) => {
    if (err) {
        console.error('❌ MySQL connection failed:', err);
        return;
    }
    console.log('✅ Connected to MySQL Database!');
});

