const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    did: { type: String, default: null },
    privshare: { type: String, default: null }, // ✅ Store Private Share Path
    privshareImage: { type: Buffer, default: null } // ✅ Store Private Share Image in MongoDB
});

// ✅ Hash password before saving
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// ✅ Seed Words List
const seedWordsList = [
    "Hill", "Bull", "Bag", "Window", "Parrot", "Cloud", "Design", "Zebra",
    "Book", "Cat", "Mobile", "Dog", "Tree", "Computer", "Bottle", "Water"
];

// ✅ Function to get 4 random seed words
const getRandomSeedWords = () => {
    let shuffledWords = [...seedWordsList];
    for (let i = shuffledWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledWords[i], shuffledWords[j]] = [shuffledWords[j], shuffledWords[i]];
    }
    return shuffledWords.slice(0, 4).map(word => word.toLowerCase());
};

// ✅ Generate Wallet and Store Private Share Image & Path
UserSchema.methods.generateWallet = async function () {
    try {
        console.log("🔄 Starting wallet generation...");

        // ✅ Step 1: Get Session Cookie
        console.log("🚀 Calling /starttempnode...");
        const startNodeResponse = await axios.get('https://webwallet.knuct.com/sapi/starttempnode');

        if (startNodeResponse.status !== 204) {
            console.error("❌ /starttempnode failed:", startNodeResponse.status);
            return;
        }

        let sessionCookie = startNodeResponse.headers['set-cookie'];
        if (!sessionCookie) {
            console.error("❌ No session cookie received from WebWallet API");
            return;
        }

        sessionCookie = sessionCookie[0].split(";")[0];
        console.log("✅ Session Cookie Received:", sessionCookie);

        // ✅ Step 2: Generate Passphrase & Seed Words
        const passphrase = crypto.randomUUID();
        const seedWords = getRandomSeedWords();
        const payload = { passphrase, seedWords };

        console.log("🌍 Sending API request to createwallet...");
        const response = await axios.post(
            'https://webwallet.knuct.com/sapi/createwallet',
            payload,
            { headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie } }
        );

        if (response.data && response.data.data) {
            this.did = response.data.data.did;
            this.privshare = response.data.data.privshare; // ✅ Store privshare path
            console.log("✅ DID & Private Share Path received:", { did: this.did, privshare: this.privshare });

            // ✅ Step 4: Fetch & Store Private Share Image
            const imageUrl = `https://webwallet.knuct.com/sapi${this.privshare}`;
            const imageResponse = await axios.get(imageUrl, {
                headers: { "Cookie": sessionCookie },
                responseType: "arraybuffer"
            });

            this.privshareImage = Buffer.from(imageResponse.data); // ✅ Store image in MongoDB
            console.log("✅ Private Share Image Stored.");

            await this.save();
        } else {
            console.error("❌ Invalid API response. DID and privshare missing.");
        }
    } catch (error) {
        console.error("❌ Error generating wallet:", error.response?.data || error.message);
    }
};

module.exports = mongoose.model('User', UserSchema);
