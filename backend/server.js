const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const User = require('./models/User');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error("❌ MongoDB connection error:", err));

app.use('/api/auth', require('./routes/auth'));

// ✅ Route to Fetch Base64 Image, Convert & Send as Download
app.get('/api/download-privshare/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        if (!userId || userId === "undefined") {
            return res.status(400).json({ message: "Invalid User ID" });
        }

        const user = await User.findById(userId);
        if (!user || !user.privshareImage) {
            return res.status(404).json({ message: "Private share image not found" });
        }

        console.log("📥 Retrieving private share image from MongoDB...");

        // ✅ Convert Buffer to Image File
        const imagePath = path.join(__dirname, `privshare_${userId}.png`); // Unique temp file
        fs.writeFileSync(imagePath, user.privshareImage);

        console.log("✅ Image saved successfully, preparing download...");

        // ✅ Send Downloadable File
        res.download(imagePath, 'privshare.png', (err) => {
            if (err) {
                console.error("❌ Error sending file:", err);
                res.status(500).json({ message: "Error downloading image." });
            }
            // ✅ Delete temp file after download
            fs.unlinkSync(imagePath);
        });

    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve private share." });
    }
});

// ✅ Start the Express Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
