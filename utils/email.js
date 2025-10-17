// utils/email.js - Enhanced with payment confirmation emails
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Existing functions
exports.sendVerificationEmail = async (toEmail, code) => {
  const mailOptions = {
    from: `"Mimi's Pet Grooming" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Your Mimi\'s Pet Grooming Verification Code',
    html: `
      <h2>Welcome to Mimi's Pet Grooming!</h2>
      <p>Use the following verification code to complete your registration:</p>
      <h3>${code}</h3>
      <p>This code is valid for 5 minutes. If you did not request this, please ignore this email.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

exports.sendResetPasswordEmail = async (toEmail, name, link) => {
  const mailOptions = {
    from: `"Mimi's Pet Grooming" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Reset Your Mimi\'s Pet Grooming Password',
    html: `
      <h2>Hello ${name},</h2>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <a href="${link}" style="display:inline-block; padding:10px 20px; background-color:#623669; color:white; text-decoration:none; border-radius:5px;">Reset Password</a>
      <p>If you did not request this, you can ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

// NEW: Payment confirmation email to customer
exports.sendPaymentConfirmationEmail = async (paymentDetails) => {
  // Validate required email data
  if (!paymentDetails.userEmail) {
    throw new Error('User email is required for payment confirmation');
  }

  if (!paymentDetails.userName) {
    console.warn('User name is missing, using default');
    paymentDetails.userName = 'Valued Customer';
  }
  
  const {
    userEmail,
    userName,
    paymentId,
    amount,
    referenceNumber,
    paidAt,
    appointmentDate,
    appointmentTime,
    petName,
    serviceName,
    serviceCategory,
    additionalServices = [], 
    basePrice = 0,           
    mattedCoatFee = 0        
  } = paymentDetails;

  const formatCurrency = (amount) => `₱${parseFloat(amount).toFixed(2)}`;
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes || '00'} ${ampm}`;
  };

  // CREATE ADDITIONAL SERVICES HTML
  let additionalServicesHtml = '';
  if (additionalServices && additionalServices.length > 0) {
    additionalServicesHtml = `
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 10px 0; color: #007dff; font-size: 16px;">✨ Additional Services</h4>
        ${additionalServices.map(service => `
          <div class="info-row">
            <span class="info-label">${service.name || 'Additional Service'}:</span>
            <span class="info-value">${formatCurrency(service.price || 0)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // CREATE PAYMENT BREAKDOWN HTML
  const paymentBreakdownHtml = `
    <div class="info-card">
      <h3 style="margin-top: 0; color: #007dff;">Payment Breakdown</h3>
      <div class="info-row">
        <span class="info-label">Primary Service (${serviceName}):</span>
        <span class="info-value">${formatCurrency(basePrice)}</span>
      </div>
      ${additionalServicesHtml}
      ${mattedCoatFee > 0 ? `
        <div class="info-row">
          <span class="info-label">Matted Coat Fee:</span>
          <span class="info-value">${formatCurrency(mattedCoatFee)}</span>
        </div>
      ` : ''}
      <div class="info-row" style="border-top: 2px solid #007dff; margin-top: 10px; padding-top: 10px; font-weight: bold;">
        <span class="info-label">Total Amount:</span>
        <span class="info-value amount">${formatCurrency(amount)}</span>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"Mimi's Pet Grooming" <${process.env.GMAIL_USER}>`,
    to: userEmail,
    subject: 'Payment Confirmed - Your Pet\'s Grooming Appointment',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Confirmation</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f8fafc;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 12px; 
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          .header { 
            background: linear-gradient(135deg, #007dff, #0099ff); 
            color: white; 
            padding: 30px 25px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 24px; 
            font-weight: 600; 
          }
          .success-icon {
            background: rgba(255,255,255,0.2);
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
            font-size: 24px;
          }
          .content { 
            padding: 30px 25px; 
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
            color: #007dff;
          }
          .info-card {
            background: #f8fafc;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #007dff;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #6b7280;
            flex: 1;
          }
          .info-value {
            font-weight: 600;
            color: #374151;
            text-align: right;
            flex: 1;
          }
          .amount {
            color: #059669;
            font-size: 18px;
          }
          .reference {
            color: #007dff;
            font-family: 'Courier New', monospace;
            background: #e0f2fe;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .appointment-card {
            background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border: 2px solid #007dff;
          }
          .next-steps {
            background: #f0fdf4;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #22c55e;
          }
          .next-steps h3 {
            color: #166534;
            margin-top: 0;
          }
          .next-steps ul {
            margin: 10px 0;
            padding-left: 20px;
          }
          .next-steps li {
            color: #374151;
            margin-bottom: 8px;
          }
          .footer {
            background: #f8fafc;
            padding: 20px 25px;
            text-align: center;
            color: #6b7280;
            border-top: 1px solid #e2e8f0;
          }
          .footer p {
            margin: 5px 0;
          }
          .contact-info {
            margin-top: 15px;
            font-size: 14px;
          }
          @media (max-width: 600px) {
            .container { margin: 10px; }
            .content { padding: 20px 15px; }
            .info-row { flex-direction: column; align-items: flex-start; }
            .info-value { text-align: left; margin-top: 5px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon"></div>
            <h1>Payment Confirmed!</h1>
            <p>Your appointment is all set</p>
          </div>
          
          <div class="content">
            <div class="greeting">
              Hello ${userName}! 👋
            </div>
            
            <p>Great news! Your payment has been successfully processed. ${petName}'s grooming appointment is now confirmed and we're excited to pamper your furry friend!</p>
            
            <!-- Payment Breakdown - UPDATED -->
            ${paymentBreakdownHtml}
            
            <!-- Payment Details -->
            <div class="info-card">
              <h3 style="margin-top: 0; color: #007dff;">Payment Details</h3>
              <div class="info-row">
                <span class="info-label">Payment Method:</span>
                <span class="info-value">GCash</span>
              </div>
              <div class="info-row">
                <span class="info-label">Reference Number:</span>
                <span class="info-value reference">${referenceNumber}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment Date:</span>
                <span class="info-value">${new Date(paidAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              </div>
            </div>
            
            <!-- Appointment Details -->
            <div class="appointment-card">
              <h3 style="margin-top: 0; color: #007dff;">🐾 Appointment Details</h3>
              <div class="info-row">
                <span class="info-label">Pet Name:</span>
                <span class="info-value">${petName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Primary Service:</span>
                <span class="info-value">${serviceName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Category:</span>
                <span class="info-value">${serviceCategory}</span>
              </div>
              ${additionalServices.length > 0 ? `
                <div class="info-row">
                  <span class="info-label">Additional Services:</span>
                  <span class="info-value">${additionalServices.length} service${additionalServices.length > 1 ? 's' : ''}</span>
                </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">${formatDate(appointmentDate)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Time:</span>
                <span class="info-value">${formatTime(appointmentTime)}</span>
              </div>
            </div>
            
            <!-- Next Steps -->
            <div class="next-steps">
              <h3>What's Next?</h3>
              <ul>
                <li><strong>Arrive 10 minutes early</strong> to complete any paperwork</li>
                <li><strong>Bring ${petName}</strong> in a comfortable carrier or on a leash</li>
                <li><strong>Share any special instructions</strong> with our groomer</li>
                <li><strong>Relax!</strong> We'll take great care of ${petName}</li>
              </ul>
              
              <p style="margin-top: 15px;"><strong>Need to reschedule or have questions?</strong> Contact us at least 24 hours in advance.</p>
            </div>
            
            <p style="text-align: center; color: #6b7280; margin-top: 30px;">
              Thank you for choosing Mimi's Pet Grooming! 🐕🐈
            </p>
          </div>
          
          <div class="footer">
            <p><strong>Mimi's Pet Grooming</strong></p>
            <div class="contact-info">
              <p>${process.env.GMAIL_USER}</p>
              <p>Contact us for any questions</p>
              <p>Mon-Sat: 8:00 AM - 6:00 PM</p>
            </div>
            <p style="margin-top: 15px; font-size: 12px;">
              This is an automated confirmation email. Please keep this for your records.
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log(`Payment confirmation email sent to ${userEmail}`);
};

// NEW: Admin notification email for new payment
exports.sendAdminPaymentNotification = async (paymentDetails) => {
  const {
    userEmail,
    userName,
    paymentId,
    amount,
    referenceNumber,
    paidAt,
    appointmentDate,
    appointmentTime,
    petName,
    serviceName,
    serviceCategory,
    appointmentId
  } = paymentDetails;

  const formatCurrency = (amount) => `₱${parseFloat(amount).toFixed(2)}`;
  const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;

  const mailOptions = {
    from: `"Mimi's Pet Grooming System" <${process.env.GMAIL_USER}>`,
    to: adminEmail,
    subject: `New Payment Received - ${formatCurrency(amount)} from ${userName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: #16a34a; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .info-card { background: #f8fafc; border-radius: 8px; padding: 15px; margin: 15px 0; border-left: 4px solid #16a34a; }
          .info-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e2e8f0; }
          .info-row:last-child { border-bottom: none; }
          .amount { color: #16a34a; font-weight: bold; font-size: 18px; }
          .reference { font-family: monospace; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Received</h1>
            <p>New payment confirmation</p>
          </div>
          
          <div class="content">
            <p><strong>A new payment has been successfully processed!</strong></p>
            
            <div class="info-card">
              <h3>Payment Information</h3>
              <div class="info-row">
                <span>Payment ID:</span>
                <span>${paymentId}</span>
              </div>
              <div class="info-row">
                <span>Amount:</span>
                <span class="amount">${formatCurrency(amount)}</span>
              </div>
              <div class="info-row">
                <span>Reference:</span>
                <span class="reference">${referenceNumber}</span>
              </div>
              <div class="info-row">
                <span>Payment Time:</span>
                <span>${new Date(paidAt).toLocaleString()}</span>
              </div>
            </div>
            
            <div class="info-card">
              <h3>Customer & Appointment</h3>
              <div class="info-row">
                <span>Customer:</span>
                <span>${userName}</span>
              </div>
              <div class="info-row">
                <span>Email:</span>
                <span>${userEmail}</span>
              </div>
              <div class="info-row">
                <span>Pet Name:</span>
                <span>${petName}</span>
              </div>
              <div class="info-row">
                <span>Service:</span>
                <span>${serviceName} (${serviceCategory})</span>
              </div>
              <div class="info-row">
                <span>Appointment:</span>
                <span>${new Date(appointmentDate).toLocaleDateString()} at ${appointmentTime}</span>
              </div>
              <div class="info-row">
                <span>Appointment ID:</span>
                <span>${appointmentId}</span>
              </div>
            </div>
            
            <p style="text-align: center; margin-top: 20px;">
              <em>This is an automated notification from your payment system.</em>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log(`Admin payment notification sent for payment ${paymentId}`);
};

// NEW: Payment failed notification
exports.sendPaymentFailedEmail = async (paymentDetails) => {
  const { userEmail, userName, amount, referenceNumber, petName, serviceName } = paymentDetails;
  const formatCurrency = (amount) => `₱${parseFloat(amount).toFixed(2)}`;

  const mailOptions = {
    from: `"Mimi's Pet Grooming" <${process.env.GMAIL_USER}>`,
    to: userEmail,
    subject: 'Payment Issue - Action Required',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .warning-card { background: #fef2f2; border-radius: 8px; padding: 15px; margin: 15px 0; border-left: 4px solid #dc2626; }
          .retry-btn { display: inline-block; background: #007dff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Issue</h1>
            <p>We couldn't process your payment</p>
          </div>
          
          <div class="content">
            <p>Hello ${userName},</p>
            
            <p>We encountered an issue processing your payment for ${petName}'s ${serviceName} appointment.</p>
            
            <div class="warning-card">
              <h3>Payment Details</h3>
              <p><strong>Amount:</strong> ${formatCurrency(amount)}<br>
              <strong>Reference:</strong> ${referenceNumber || 'N/A'}</p>
            </div>
            
            <p><strong>What you can do:</strong></p>
            <ul>
              <li>Check your GCash balance and try again</li>
              <li>Ensure you have a stable internet connection</li>
              <li>Contact us if you continue to experience issues</li>
            </ul>
            
            <p>Your appointment is still reserved, but payment is required to confirm it.</p>
            
            <p style="text-align: center;">
              <a href="#" class="retry-btn">Try Payment Again</a>
            </p>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log(`Payment failed notification sent to ${userEmail}`);
};