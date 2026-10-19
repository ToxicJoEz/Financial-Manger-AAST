import bcrypt from 'bcryptjs';
// Supply a password through stdin, not command arguments or source code.
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024) throw new Error('Input is too long.'); }
const password = input.replace(/\r?\n$/, '');
if (!password || Buffer.byteLength(password) > 72) throw new Error('Enter a password of 1 to 72 UTF-8 bytes.');
console.log(await bcrypt.hash(password, 12));
