##USER_CODE_HERE##

// The judge pipes the testcase in on stdin; fd 0 is that pipe.
const input = require('fs').readFileSync(0, 'utf8').trim().split('\n').join(' ').split(/\s+/);
const size_arr = parseInt(input.shift());
const arr = input.splice(0, size_arr).map(Number);
const result = maxElement(arr);
console.log(result);
    