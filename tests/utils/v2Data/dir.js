const fs = require('fs');

function fillDir(path, { count, size }) {
    fs.mkdirSync(path);
    const data = Buffer.alloc(size);
    for (let i = 0; i < count; i += 1) {
        fs.writeFileSync(`${path}/${i}`, data);
    }
}
module.exports = {
    fillDir,
};
