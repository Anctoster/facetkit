// Canonical JSON: one text for one value, whatever order its keys were written in. Hashes and
// signatures are taken over this text, so that a record parsed and written again by another tool
// (or another language) still has the same digest. Keys are sorted by code point, there is no
// whitespace, and numbers are written the way JSON.stringify writes them — which for finite numbers
// is the form RFC 8785 asks for. Values JSON cannot carry are refused rather than dropped.

/** The canonical text of a JSON value. Throws on undefined, functions, symbols, BigInt and non-finite numbers. */
export function canon(value) {
    if (value === null) return 'null';
    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false';
        case 'string':
            return JSON.stringify(value);
        case 'number':
            if (!Number.isFinite(value)) throw new TypeError(`canon: ${value} has no JSON form`);
            return JSON.stringify(value);
        case 'object':
            if (Array.isArray(value)) return `[${value.map((v) => canon(v)).join(',')}]`;
            return `{${Object.keys(value)
                .filter((k) => value[k] !== undefined) // as JSON.stringify: an absent value is an absent key
                .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
                .map((k) => `${JSON.stringify(k)}:${canon(value[k])}`)
                .join(',')}}`;
        default:
            throw new TypeError(`canon: a ${typeof value} has no JSON form`);
    }
}
