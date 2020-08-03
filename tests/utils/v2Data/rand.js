function range(n, step) {
    const vals = [...Array(n).keys()];
    if (step) {
        return vals.map(i => i * step);
    }
    return vals;
}

function randInt(withNegative = true) {
    const x = Math.floor(Math.random() * 10000);
    return withNegative && Math.random() < 0.5 ? -x : x;
}

function maybe(func) {
    return Math.random() < 0.5 && func();
}

function randChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

module.exports = {
    range,
    maybe,
    randInt,
    randChoice,
};
