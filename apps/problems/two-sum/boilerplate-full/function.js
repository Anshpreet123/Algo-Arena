##USER_CODE_HERE##

// The judge pipes the testcase in on stdin; fd 0 is that pipe.
const input = require('fs').readFileSync(0, 'utf8').trim().split('\n').join(' ').split(/\s+/);
const num1 = parseInt(input.shift());
  const num2 = parseInt(input.shift());
const result = sum(num1, num2);
console.log(result);
    