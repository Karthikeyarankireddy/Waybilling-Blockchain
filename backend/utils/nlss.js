/**
 * Helper functions for NLSS authentication
 */

const { sha3_256: hashFu } = require("js-sha3"); // ✅ Use CommonJS `require`

/**
 * Creates a challenge response for Knuct API authentication
 * @param {string} challenge - Challenge received from Knuct API
 * @param {number} positionCount - Number of positions to use (usually 32)
 * @param {Uint8Array} privShare - Private share image bytes
 * @returns {number[]} - Binary response array (0s and 1s)
 */
function createChallengeResponse(challenge, positionCount, privShare) {
    console.log("📝 Creating challenge response with:", {
        challengeLength: challenge.length,
        positionCount,
        privShareLength: privShare.length
    });
    
    // Direct use of the challenge without additional hashing
    let [_, signPosition] = randomPosition("sign", challenge, positionCount, privShare);
    
    // Get the binary values at the computed positions
    let response = getPvtPositions(signPosition, privShare);
    
    console.log(`✅ Generated response of length: ${response.length}`);
    return response;
}

/**
 * Create random positions from challenge for signing
 * @param {string} role - Role ("sign" or "verify")
 * @param {string} challengeHash - Challenge hash from server
 * @param {number} positionCount - Number of positions (32)
 * @param {Uint8Array} privShare - Private share image data
 * @returns {Array} - Arrays of original and sign positions
 */
function randomPosition(role, challengeHash, positionCount, privShare) {
    let u = 0, m = 0;
    let signPosition = new Array(positionCount * 8).fill(0);
    let originalPosition = new Array(positionCount).fill(0);
    
    // Use the challenge directly as the starting hash
    let hash = challengeHash;
    
    console.log(`🔄 Processing ${positionCount} positions with hash: ${hash.substring(0, 16)}...`);
    
    for (let i = 0; i < positionCount; i++) {
        // Get numeric value of hash character
        let hashChar = getNumericValue(hash.charAt(i));
        
        // Deterministic calculation for position
        let detVal = (((2402 + hashChar) * 2709) + ((i + 2709) + hashChar)) % 2048;
        
        // Align to byte boundary (multiple of 8)
        originalPosition[i] = (detVal >> 3) << 3;
        
        let positionArray = new Array(positionCount).fill(0);
        let finalPosition = new Array(8).fill(0);
        
        positionArray[i] = originalPosition[i];
        
        // Generate 8 consecutive positions for each original position
        let l = 0;
        for (let p = 0; p < 8; p++) {
            signPosition[u] = positionArray[i];
            finalPosition[l] = positionArray[i];
            positionArray[i]++;
            u++;
            l++;
        }
        
        if (role === "sign") {
            // Get bits at the computed positions
            let ptSign = getPvtPositions(finalPosition, privShare);
            
            // Update hash for next iteration
            hash = hashFu(hash + intArray2Str(originalPosition) + intArray2Str(ptSign));
        } else {
            let p1 = privShare.slice(m, m + 8);
            m += 8;
            hash = hashFu(hash + intArray2Str(originalPosition) + intArray2Str(p1));
        }
    }
    
    return [originalPosition, signPosition];
}

/**
 * Convert a hex character to its numeric value
 * @param {string} ch - Single character
 * @returns {number} - Numeric value
 */
function getNumericValue(ch) {
    let code = ch.charCodeAt(0);
    if (code >= "0".charCodeAt(0) && code <= "9".charCodeAt(0)) 
        return code - "0".charCodeAt(0);
    if (code >= "a".charCodeAt(0) && code <= "f".charCodeAt(0)) 
        return code - "a".charCodeAt(0) + 10;
    if (code >= "A".charCodeAt(0) && code <= "F".charCodeAt(0)) 
        return code - "A".charCodeAt(0) + 10;
    return 0; // Default to 0 for invalid characters instead of -1
}

/**
 * Convert an array of integers (0 or 1) to a string
 * @param {number[]} array - Array of integers
 * @returns {string} - String of 0s and 1s
 */
function intArray2Str(array) {
    return array.map((v) => (v === 1 ? "1" : "0")).join("");
}

/**
 * Extract bits from private share at specified positions
 * @param {number[]} positions - Array of bit positions
 * @param {Uint8Array} pvtShare - Private share data
 * @returns {number[]} - Array of bits (0 or 1) at those positions
 */
function getPvtPositions(positions, pvtShare) {
    let privatePosition = new Array(positions.length);
    for (let k = 0; k < positions.length; k++) {
        const a = positions[k];
        const b = getShareBinDigit(pvtShare, a);
        privatePosition[k] = b;
    }
    return privatePosition;
}

/**
 * Extract a specific bit from the private share
 * @param {Uint8Array} pvtShare - Private share data
 * @param {number} index - Bit index
 * @returns {number} - Bit value (0 or 1)
 */
function getShareBinDigit(pvtShare, index) {
    // Find byte index and bit position within byte
    let byteIndex = Math.floor(index / 8);
    let bitPosition = index % 8;
    
    // Guard against out-of-bounds access
    if (byteIndex >= pvtShare.length) {
        console.warn(`⚠️ Index out of bounds: ${byteIndex} >= ${pvtShare.length}`);
        return 0;
    }
    
    // Get byte and extract specific bit
    let byte = pvtShare[byteIndex];
    return (byte & (0x80 >> bitPosition)) ? 1 : 0;
}

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} byteArray 
 * @returns {string} - Hex string
 */
function Uint8ArrayToHex(byteArray) {
    return Array.from(byteArray, (byte) => 
        byte.toString(16).padStart(2, "0")).join("");
}

// Export functions using CommonJS
module.exports = {
    createChallengeResponse,
    // Export additional functions for testing if needed
    _internal: {
        randomPosition,
        getPvtPositions,
        getShareBinDigit,
        Uint8ArrayToHex
    }
};