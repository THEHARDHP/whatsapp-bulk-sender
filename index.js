const express = require('express');
const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
// ફાઈલની સાઈઝ મોટી હોવાથી limit વધારીને 50mb કરી છે
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let sock;

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('QR Code Link: https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qr));
            console.log('ઉપરનો QR કોડ તમારા WhatsApp થી સ્કેન કરો!');
        }

        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== 401;
            console.log('કનેક્શન તૂટી ગયું છે, ફરીથી જોડાઈ રહ્યું છે...', shouldReconnect);
            if(shouldReconnect) connectToWhatsApp();
        } else if(connection === 'open') {
            console.log('✅ તમારું WhatsApp સફળતાપૂર્વક કનેક્ટ થઈ ગયું છે!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

// --- નવો ઉમેરેલો કોડ: સર્વરને જાગતું રાખવા માટે (Cron-job માટે) ---
app.get('/', (req, res) => {
    res.send('Server is awake! WhatsApp API is running 100% fine.');
});
// -------------------------------------------------------------

// મેસેજ અને ફાઈલ મોકલવા માટેની API
app.post('/api/send', async (req, res) => {
    try {
        // નવી આવેલી વિગતો (mediaBase64, mediaName, mediaMime)
        const { number, message, mediaBase64, mediaName, mediaMime } = req.body;
        
        let formattedNumber = number.toString().startsWith("91") ? number : "91" + number;
        const jid = formattedNumber + "@s.whatsapp.net"; 
        
        // જો ફાઈલ મોકલી હોય તો
        if (mediaBase64 && mediaMime) {
            const buffer = Buffer.from(mediaBase64, 'base64');
            const captionText = message || ""; // જો મેસેજ ખાલી હોય તો બ્લેન્ક

            // જો ફાઈલ ઈમેજ (Photo) હોય
            if (mediaMime.startsWith('image/')) {
                await sock.sendMessage(jid, { 
                    image: buffer, 
                    caption: captionText 
                });
            } 
            // જો ફાઈલ વિડીયો હોય
            else if (mediaMime.startsWith('video/')) {
                await sock.sendMessage(jid, { 
                    video: buffer, 
                    caption: captionText 
                });
            } 
            // PDF કે અન્ય કોઈ પણ ફાઈલ હોય (Document)
            else {
                await sock.sendMessage(jid, { 
                    document: buffer, 
                    mimetype: mediaMime,
                    fileName: mediaName || 'file',
                    caption: captionText 
                });
            }
            console.log(`ફાઈલ સાથે મેસેજ મોકલાયો: ${formattedNumber}`);
            
        } else {
            // જો માત્ર ટેક્સ્ટ મેસેજ હોય (ફાઈલ ન હોય)
            await sock.sendMessage(jid, { text: message || "" });
            console.log(`માત્ર ટેક્સ્ટ મેસેજ મોકલાયો: ${formattedNumber}`);
        }
        
        res.json({ success: true, msg: "Message Sent Successfully!" });
    } catch (err) {
        console.error("મેસેજ મોકલવામાં ભૂલ:", err);
        res.json({ success: false, msg: "Message Failed!" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('🚀 API સર્વર ચાલુ થઈ ગયું છે. QR કોડની રાહ જુઓ...');
});
