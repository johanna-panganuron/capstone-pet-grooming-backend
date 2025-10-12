// generateHash.js
const bcrypt = require('bcryptjs');

const plainPassword = 'mimispetgroomingcapstone'; // <--- CHOOSE A STRONG PASSWORD HERE

bcrypt.hash(plainPassword, 10) // 10 is the salt rounds, generally good
    .then(hash => {
        console.log('Hashed Password:', hash);
    })
    .catch(err => {
        console.error('Error hashing password:', err);
    });