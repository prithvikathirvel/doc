import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

export const authMiddleware = (req: any, res: any): boolean => {
    try {
        logger.info('middleware --> authorization --> decode jwt --> idToken -->', req.headers.idtoken);
        // const token = req.headers.idtoken;
        // if (!token) {
        //     res.status(401).json({ error: 'Token not provided' });
        //     return true; 
        // }

        // const decodedToken: any = jwt.decode(token);
        // if (!decodedToken) {
        //     res.status(401).json({ error: 'Invalid token' });
        //     return true;
        // }

        // const userName = decodedToken.name;
        // if (!userName) {
        //     res.status(401).json({ error: 'User name not found in token' });
        //     return true; 
        // }
        // req.userName = userName;
        return false;
    } catch (error) {
        logger.error('middleware --> authorization --> decode jwt --> Error decoding token:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
        return true; 
    }
};
