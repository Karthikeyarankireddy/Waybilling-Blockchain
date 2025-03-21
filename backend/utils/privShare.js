/**
 * contains functions for manipulating privshare
 */
const { createCanvas, loadImage } = require('canvas'); 
const md5 = require('md5');



/**
 * gets the image data of a file using canvas API's context.getImageData()
 * @param {File} file - a file object of an image, usually taken from <input type='file'>
 * @param {function} callback - called on success with the image data(Uint8Array) of the 
 *      given image file as argument.
 * @param {function} errCallback - (optional) called on error with the error object that 
 *      was thrown
 * @throws {Error} - if callback is not a function
 */
function getImageData(file, callback, errCallback = null) {
    if (typeof callback !== 'function') {
        throw new Error('callback should be a function');
    }

    // Use canvas from the 'canvas' package
    const canvas = createCanvas(0, 0); // Create canvas object
    const ctx = canvas.getContext('2d'); // Get 2d context from canvas
    loadImage(file.buffer)  // Buffer can be passed directly to loadImage in Node.js
        .then((img) => {
            // Set canvas size to the image's size
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw the image to the canvas context
            ctx.drawImage(img, 0, 0);

            // Extract image data
            const imgData = ctx.getImageData(0, 0, img.width, img.height);

            // Convert the image data to a Uint8Array and pass it to the callback
            callback(new Uint8Array(imgData.data.buffer));
        })
        .catch((err) => {
            if (typeof errCallback === 'function') {
                errCallback(err);
            }
        });
}
/**
 * removes the alpha channel from image data got from
 * value canvas API.
 * @param {Uint8Array} imgData - Image data with alpha value
 * @returns {Uint8Array} - Alpha removed image data
 * @throws {Error} - if image data is not of proper type or if
 *      image data's length is not a multiple of 4
 */
function removeAlphaChannel(imgData) {
    if (!(imgData instanceof Uint8Array))
        throw new Error('image data should be of type Uint8Array')
    if (imgData.length % 4 !== 0)
        throw new Error('invalid length for image data, not a multiple of 4')

    const len = imgData.length - imgData.length / 4 // number of r,g,b values (no alpha)
    const newImgData = new Uint8Array(len)

    for (let i = 0, j = 0; i < imgData.length; i += 4, j += 3) {
        newImgData[j] = imgData[i]
        newImgData[j + 1] = imgData[i + 1]
        newImgData[j + 2] = imgData[i + 2]
    }
    return newImgData
}

/**
 * compute the md5 multi-hash of a string or buffer.
 * The multi-format code used for md5 is only in draft stage.
 * @param {String|Uint8Array} data - data whose hash is to be computed
 * @returns {Uint8Array} - Array of bytes (lenght=16+2)
 */
function mh_md5(data) {
    const md5Code = 0xd5
    const hashLenght = 16 // in bytes
    let hash = md5(data, { asBytes: true })
    // adding hash length
    hash.unshift(hashLenght)
    // adding algo code (varint of md5Code is 0xd5 0x1)
    hash.unshift(0x1)
    hash.unshift(md5Code)
    return hash
}

/**
 * convert given data to string using multi-bases's base32 
 * encoding format.
 * @param {Uint8Array|Array} data - data to convert to base32
 * @returns {String} - base32 encoded data
 */
function mb_base32(data) {
    const prefix = 'b'
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
    const bitsPerChar = 5
    return prefix + baseEncode(data, alphabet, bitsPerChar)
}

// problem with array of odd length
function ui8ArrayToUTF16(array) {
    if (!array instanceof Uint8Array)
        throw new Error('require an array of type Uint8Array as parameter')
    if (array.length & 1)
        throw new Error('Array should be of even length')

    var str = ''
    var char
    for (let i = 0; i < array.length; i += 2) {
        char = (array[i] << 8) | array[i + 1]
        str += String.fromCharCode(char)
    }
    return str;
}

function ui8ArrayFromUTF16(str) {
    if (typeof str !== 'string')
        throw new Error('require a string a parameter')

    var array = new Uint8Array(str.length * 2)
    var char
    for (let i = 0; i < str.length; i++) {
        char = str.charCodeAt(i)
        array[i * 2] = char >> 8
        array[i * 2 + 1] = char & 0xFF
    }
    return array
}

/**
 * baseEncode function of multi-base
 * source: js-multiformats/bases/base.js encode function
 * @param {*} data 
 * @param {*} alphabet - alphabet
 * @param {*} bitsPerChar 
 * @returns {string}
 */
function baseEncode(data, alphabet, bitsPerChar) {
    const pad = alphabet[alphabet.length - 1] === '='
    const mask = (1 << bitsPerChar) - 1
    let out = ''

    let bits = 0 // Number of bits currently in the buffer
    let buffer = 0 // Bits waiting to be written out, MSB first
    for (let i = 0; i < data.length; ++i) {
        // Slurp data into the buffer:
        buffer = (buffer << 8) | data[i]
        bits += 8

        // Write out as much as we can:
        while (bits > bitsPerChar) {
            bits -= bitsPerChar
            out += alphabet[mask & (buffer >> bits)]
        }
    }

    // Partial character:
    if (bits) {
        out += alphabet[mask & (buffer << (bitsPerChar - bits))]
    }

    // Add padding characters until we hit a byte boundary:
    if (pad) {
        while ((out.length * bitsPerChar) & 7) {
            out += '='
        }
    }

    return out
}


module.exports = {  mh_md5,mb_base32,removeAlphaChannel,ui8ArrayToUTF16,ui8ArrayFromUTF16,getImageData, };