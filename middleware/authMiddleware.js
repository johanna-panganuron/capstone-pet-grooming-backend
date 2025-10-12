// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// verifyToken function
exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  console.log('=== TOKEN VERIFICATION ===');
  console.log('Authorization header:', req.headers.authorization);
  console.log('Extracted token:', token ? 'Token present' : 'No token');
  
  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded successfully:', JSON.stringify(decoded, null, 2));
    
    if (!decoded.id) {
      console.error('❌ CRITICAL: Token does not contain user ID!');
      console.log('Token payload:', decoded);
      return res.status(401).json({ message: 'Invalid token structure - missing user ID' });
    }
    
    // ✅ Ensure req.user has all necessary fields
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      ...decoded // Include any other fields from token
    };
    
    console.log('✅ req.user set to:', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name
    });
    
    next();
  } catch (err) {
    console.log('Token verification failed:', err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Enhanced authorize function that supports multiple roles
exports.authorize = (roles) => {
  return (req, res, next) => {
    console.log('=== AUTHORIZATION CHECK ===');
    console.log('Required roles:', roles);
    console.log('User role:', req.user?.role);
    
    // Convert single role to array for consistency
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!req.user) {
      console.log('❌ No user in request');
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      console.log('❌ Access denied - role mismatch');
      console.log(`User has role '${req.user.role}', but needs one of:`, allowedRoles);
      
      return res.status(403).json({ 
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
        userRole: req.user.role,
        requiredRoles: allowedRoles
      });
    }
    
    console.log('✅ Authorization successful');
    next();
  };
};

exports.verifyOwner = exports.authorize('owner');
exports.verifyStaff = exports.authorize('staff');
exports.verifyPetOwner = exports.authorize('pet_owner');
exports.verifyOwnerOrPetOwner = exports.authorize(['owner', 'pet_owner']);
exports.verifyOwnerOrStaff = exports.authorize(['owner', 'staff']);