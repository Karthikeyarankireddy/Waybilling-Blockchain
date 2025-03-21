const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const User = require("../models/User");
const { createChallengeResponse } = require("../utils/nlss");
const privShare = require("../utils/privShare");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const KNUCT_API = "https://webwallet.knuct.com/sapi"; // ✅ Knuct API Base URL

/** ✅ REGISTER ROUTE - Generates Wallet During Registration */
router.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const user = new User({ username, email, password });

        await user.generateWallet();
        await user.save();

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user._id,
                username: user.username,
                did: user.did,
                privshare: user.privshare,
                downloadLink: `http://localhost:5000/api/download-privshare/${user._id}`,
            },
        });

    } catch (err) {
        console.error("❌ Registration Error:", err);
        res.status(500).json({ error: err.message });
    }
});

/** ✅ LOGIN WITH PRIVSHARE IMAGE */
router.post("/login-with-image", upload.single("privshareImage"), async (req, res) => {
    let privshareImagePath = null;
    try {
        const { email } = req.body;
        if (!req.file) {
            return res.status(400).json({ message: "Privshare image is required." });
        }

        privshareImagePath = req.file.path;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "User not found" });

        console.log("🔍 Processing Privshare image...");

        let privshareImage;
        try {
            privshareImage = fs.readFileSync(privshareImagePath);
        } catch (error) {
            console.error("❌ Error reading image file:", error.message);
            return res.status(500).json({ message: "Error processing image file." });
        }

        /** ✅ Step 1: Start Temporary Session */
        let sessionCookie;
        try {
            const startNodeResponse = await axios.get(`${KNUCT_API}/starttempnode`);
            sessionCookie = startNodeResponse.headers["set-cookie"];

            if (!sessionCookie) {
                console.error("❌ No session cookie received from WebWallet API");
                return res.status(500).json({ message: "Session Initialization Failed." });
            }

            sessionCookie = sessionCookie[0].split(";")[0];
            console.log("✅ Session Cookie Received:", sessionCookie);
        } catch (err) {
            console.error("❌ Error Starting Temporary Node:", err.message);
            return res.status(500).json({ message: "Error starting authentication session" });
        }

        /** ✅ Step 2: Process Image & Compute Hash */
        const imageData = await new Promise((resolve, reject) => {
            privShare.getImageData({ buffer: privshareImage }, resolve, reject);
        });

        if (!imageData) {
            console.error("❌ Failed to extract image data.");
            return res.status(500).json({ message: "Failed to process image." });
        }
        console.log("✅ Image data extracted.");

        // ✅ Remove alpha channel before hashing
        const imageDataWithoutAlpha = privShare.removeAlphaChannel(imageData);
        console.log("✅ Alpha channel removed.");

        // ✅ Correct Hash Computation (Fix)
        const md5Hash = privShare.mh_md5(imageDataWithoutAlpha);
        const base32Hash = privShare.mb_base32(md5Hash);
        console.log("✅ Knuct-Compatible Base32 Hash generated:", base32Hash);

        /** ✅ Step 3: Request Challenge */
        let challenge;
        try {
            const challengeResponse = await axios.post(
                `${KNUCT_API}/auth/challenge`,
                { hash: base32Hash },
                { headers: { Cookie: sessionCookie } }
            );

            if (!challengeResponse.data?.data?.challenge) {
                console.error("❌ Challenge API returned unexpected response:", challengeResponse.data);
                return res.status(500).json({ message: "Invalid challenge response." });
            }

            challenge = challengeResponse.data.data.challenge;
            console.log("✅ Challenge received:", challenge);
        } catch (error) {
            console.error("❌ Error in Challenge API:", error.response?.data || error.message);
            return res.status(500).json({ message: "Failed to generate challenge." });
        }

        /** ✅ Step 4: Generate Corrected Challenge Response */
        const challengeResponseArray = createChallengeResponse(challenge, 32, imageDataWithoutAlpha);
        
        if (challengeResponseArray.length !== 256) {
            console.error("❌ Error: Response length is incorrect.");
            return res.status(500).json({ message: "Invalid response format." });
        }

        /** ✅ Step 5: Send Response */
        try {
            console.log("🖊 Challenge Response Sent:", JSON.stringify(challengeResponseArray));

            const authResponse = await axios.post(
                `${KNUCT_API}/auth/response`,
                { response: challengeResponseArray },
                { headers: { Cookie: sessionCookie } }
            );

            if (authResponse.status !== 204) {
                console.error("❌ Response API failed:", authResponse.data);
                return res.status(401).json({ message: "DID authentication failed" });
            }

            console.log("✅ Challenge Response Verified!");
        } catch (error) {
            console.error("❌ Error in Response API:", error.response?.data || error.message);
            return res.status(500).json({ message: "Failed to authenticate with DID." });
        }

        /** ✅ Step 6: Start Node Before Fetching Wallet Data */
        try {
            await axios.get(`${KNUCT_API}/startnode`, { headers: { Cookie: sessionCookie } });
            console.log("✅ Knuct Node Started!");
        } catch (err) {
            console.error("❌ Start Node Error:", err.message);
            return res.status(500).json({ message: "Error starting node" });
        }

        /** ✅ Step 7: Fetch Wallet Data (DID) */
        try {
            const walletDataResponse = await axios.get(`${KNUCT_API}/walletdata`, {
                headers: { Cookie: sessionCookie },
            });

            const did = walletDataResponse.data?.data?.did;
            if (!did) {
                return res.status(500).json({ error: "DID not found in wallet data" });
            }

            console.log("✅ User DID:", did);
            return res.status(200).json({
                message: "Login successful",
                did,
            });
        } catch (err) {
            console.error("❌ Wallet Data Fetch Error:", err.message);
            return res.status(500).json({ message: "Error fetching wallet data" });
        }
    } catch (err) {
        console.error("❌ Login Error:", err.message);
        res.status(500).json({ error: "Login failed. Please try again." });
    } finally {
        // Ensure temp file cleanup
        if (privshareImagePath) {
            fs.unlink(privshareImagePath, (err) => {
                if (err) console.error("❌ Error deleting uploaded file:", err);
            });
        }
    }
});


module.exports = router;
