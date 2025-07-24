
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// --- 目录设置 ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads'); // Temp directory for uploads

// 创建必要的目录
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- Multer 设置 (用于处理文件上传) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- 中间件 ---
// 解析JSON和URL编码的请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 动态服务 index.html 以防止缓存 script.js ---
app.get('/', (req, res) => {
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading index.html:', err);
            return res.status(500).send('Error loading page.');
        }
        // 获取当前时间戳作为版本号
        const timestamp = new Date().getTime();
        // 替换 script.js 的引用，添加版本号
        const modifiedHtml = data.replace('<script src="script.js"></script>', `<script src="script.js?v=${timestamp}"></script>`);
        
        // 设置 Cache-Control 头，防止 index.html 被缓存
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.send(modifiedHtml);
    });
});

// --- 静态文件服务 (除了 index.html) ---
// 确保 style.css, script.js, 以及 data 目录下的音频文件等可以被访问
app.use(express.static(__dirname));

// --- API 路由 ---

// GET: 获取所有数据记录
app.get('/api/data', (req, res) => {
    fs.readdir(DATA_DIR, (err, files) => {
        if (err) {
            console.error("Error reading data directory:", err);
            return res.status(500).json({ message: "Could not read data directory." });
        }

        const jsonDataFiles = files.filter(file => file.endsWith('.json'));
        const records = jsonDataFiles.map(file => {
            try {
                const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
                const data = JSON.parse(content);
                const basename = path.basename(file, '.json');
                // 查找对应的音频文件
                const audioFile = files.find(f => f.startsWith(basename) && (f.endsWith('.wav') || f.endsWith('.mp4')));
                return {
                    basename: basename,
                    audioFile: audioFile ? `/data/${audioFile}` : null,
                    annotations: data
                };
            } catch (e) {
                console.error(`Error processing file ${file}:`, e);
                return null;
            }
        }).filter(Boolean); // 过滤掉解析失败的 null

        res.json(records);
    });
});

// POST: 保存新的数据记录
app.post('/api/save-data', upload.single('audio'), (req, res) => {
    try {
        const annotationData = JSON.parse(req.body.annotations);
        const tempAudioPath = req.file.path;
        const audioMimeType = req.body.mimeType || 'audio/mp4';

        const extension = audioMimeType.startsWith('audio/wav') ? '.wav' : '.mp4';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filenameBase = `watermelon_data_${timestamp}`;
        const audioFilename = filenameBase + extension;
        const jsonFilename = filenameBase + '.json';

        const finalAudioPath = path.join(DATA_DIR, audioFilename);
        const finalJsonPath = path.join(DATA_DIR, jsonFilename);

        fs.renameSync(tempAudioPath, finalAudioPath);
        fs.writeFileSync(finalJsonPath, JSON.stringify(annotationData, null, 2));

        console.log(`Successfully saved: ${audioFilename} and ${jsonFilename}`);
        res.status(201).json({ message: 'Data saved successfully!', basename: filenameBase });

    } catch (error) {
        console.error('Error saving new data:', error);
        res.status(500).json({ message: 'Error saving data on the server.' });
    }
});

// PUT: 更新已有的数据记录
app.put('/api/data/:basename', (req, res) => {
    const basename = req.params.basename;
    const annotationData = req.body.annotations;
    const jsonFilePath = path.join(DATA_DIR, `${basename}.json`);

    if (!fs.existsSync(jsonFilePath)) {
        return res.status(404).json({ message: "Record not found." });
    }

    try {
        fs.writeFileSync(jsonFilePath, JSON.stringify(annotationData, null, 2));
        console.log(`Successfully updated: ${basename}.json`);
        res.status(200).json({ message: 'Record updated successfully!' });
    } catch (error) {
        console.error(`Error updating ${basename}.json:`, error);
        res.status(500).json({ message: 'Error updating record.' });
    }
});

// DELETE: 删除数据记录 (音频 + JSON)
app.delete('/api/data/:basename', (req, res) => {
    const basename = req.params.basename;
    const jsonFilePath = path.join(DATA_DIR, `${basename}.json`);
    
    if (!fs.existsSync(jsonFilePath)) {
        return res.status(404).json({ message: "Record not found." });
    }

    try {
        // 删除 JSON 文件
        fs.unlinkSync(jsonFilePath);

        // 查找并删除关联的音频文件
        const files = fs.readdirSync(DATA_DIR);
        const audioFile = files.find(f => f.startsWith(basename) && (f.endsWith('.wav') || f.endsWith('.mp4')));
        if (audioFile) {
            fs.unlinkSync(path.join(DATA_DIR, audioFile));
        }
        
        console.log(`Successfully deleted record: ${basename}`);
        res.status(200).json({ message: 'Record deleted successfully!' });
    } catch (error) {
        console.error(`Error deleting record ${basename}:`, error);
        res.status(500).json({ message: 'Error deleting record.' });
    }
});


// --- 启动服务器 ---
app.listen(port, () => {
    console.log(`服务器正在运行，请访问 http://localhost:${port}`);
    console.log(`数据将保存在: ${DATA_DIR}`);
});
