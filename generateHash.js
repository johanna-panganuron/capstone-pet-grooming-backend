// generateHash.js
const bcrypt = require('bcryptjs');

const plainPassword = 'mimispetgroomingcapstone';

bcrypt.hash(plainPassword, 10)
    .then(hash => {
        console.log('Hashed Password:', hash);
    })
    .catch(err => {
        console.error('Error hashing password:', err);
    });