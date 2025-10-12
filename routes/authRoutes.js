// routes\authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/signup', authController.verifyAndRegister);
router.post('/login', authController.loginUser);
router.post('/refresh-token', authController.refreshToken);
router.post('/send-verification', authController.sendVerificationCode);
router.post('/forgot-password', authController.sendResetPasswordLink);
router.post('/reset-password', authController.resetPassword);
router.post('/google', authController.googleAuth);

module.exports = router;