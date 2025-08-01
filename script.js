document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const recordButton = document.getElementById('recordButton');
    const stopButton = document.getElementById('stopButton');
    const reRecordButton = document.getElementById('reRecordButton');
    const status = document.getElementById('status');
    const playbackSection = document.getElementById('playbackSection');
    const audioPlayback = document.getElementById('audioPlayback');
    const annotationSection = document.getElementById('annotationSection');
    const annotationForm = document.getElementById('annotationForm');
    const ripenessScore = document.getElementById('ripenessScore');
    const scoreOutput = document.getElementById('scoreOutput');
    const saveButton = document.getElementById('saveButton');
    const dataListContainer = document.getElementById('dataListContainer');
    const editingBasenameInput = document.getElementById('editingBasename');
    const formTitle = document.getElementById('form-title');
    const cancelEditButton = document.getElementById('cancelEditButton');

    // Recorder state
    let mediaRecorder;
    let audioChunks = [];
    let audioBlob;
    let selectedMimeType;

    // --- Compatibility and Initialization ---
    function initialize() {
        // 优先尝试 WAV，然后是 MP4，最后是 WebM
        const MimeTypes = ['audio/wav', 'audio/mp4', 'audio/webm'];
        selectedMimeType = MimeTypes.find(type => MediaRecorder.isTypeSupported(type));

        if (!selectedMimeType) {
            status.textContent = '错误：您的浏览器不支持任何可用的录音格式。';
            recordButton.disabled = true;
            return;
        }
        console.log(`Using MIME type: ${selectedMimeType}`);
        loadDataRecords();
    }

    // --- Data Loading and Display ---
    async function loadDataRecords() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error('Failed to fetch data records.');
            const records = await response.json();
            displayRecords(records);
        } catch (error) {
            console.error('Error loading data:', error);
            dataListContainer.innerHTML = '<p>无法加载数据列表。</p>';
        }
    }

    function displayRecords(records) {
        dataListContainer.innerHTML = '';
        if (records.length === 0) {
            dataListContainer.innerHTML = '<p>还没有任何数据记录。</p>';
            return;
        }

        records.sort((a, b) => b.annotations.timestamp.localeCompare(a.annotations.timestamp));

        records.forEach(record => {
            const card = document.createElement('div');
            card.className = 'data-card';
            card.dataset.basename = record.basename;

            const groundTruth = record.annotations.ground_truth || 'not_verified';
            const prediction = record.annotations.prediction || 'N/A';

            card.innerHTML = `
                <div class="card-header">
                    <strong>${new Date(record.annotations.timestamp).toLocaleString()}</strong>
                </div>
                <div class="card-body">
                    <p><strong>预测:</strong> ${prediction} | <strong>最终验证:</strong> <span class="status-${groundTruth}">${groundTruth}</span></p>
                    <audio src="${record.audioFile}" controls></audio>
                </div>
                <div class="card-actions">
                    <button class="button-edit">编辑</button>
                    <button class="button-delete">删除</button>
                </div>
            `;

            card.querySelector('.button-edit').addEventListener('click', () => handleEdit(record));
            card.querySelector('.button-delete').addEventListener('click', () => handleDelete(record.basename));

            dataListContainer.appendChild(card);
        });
    }

    // --- Event Handlers (Edit, Delete, Cancel) ---
    function handleEdit(record) {
        resetForm(false); // Don't hide the form
        formTitle.textContent = '正在编辑记录';
        editingBasenameInput.value = record.basename;

        // Populate form with record data
        record.annotations.sound_description.forEach(val => {
            const checkbox = annotationForm.querySelector(`input[name="sound"][value="${val}"]`);
            if (checkbox) checkbox.checked = true;
        });
        ripenessScore.value = record.annotations.ripeness_score;
        scoreOutput.textContent = ripenessScore.value;
        document.getElementById('prediction').value = record.annotations.prediction;
        document.getElementById('notes').value = record.annotations.notes;
        document.getElementById('groundTruth').value = record.annotations.ground_truth;

        // Show form and scroll to it
        annotationSection.classList.remove('hidden');
        playbackSection.classList.add('hidden'); // Hide recorder playback
        recordButton.disabled = true; // Disable new recordings while editing
        reRecordButton.classList.add('hidden'); // Hide re-record button
        cancelEditButton.classList.remove('hidden');
        saveButton.textContent = '更新标注';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function handleDelete(basename) {
        if (!confirm(`确定要删除记录 ${basename} 吗？此操作无法撤销。`)) return;

        try {
            const response = await fetch(`/api/data/${basename}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete record.');
            
            // Visually remove the card
            const cardToRemove = dataListContainer.querySelector(`[data-basename="${basename}"]`);
            if (cardToRemove) cardToRemove.remove();
            alert('记录已删除。');
            loadDataRecords(); // Refresh list
        } catch (error) {
            console.error('Error deleting record:', error);
            alert('删除失败。');
        }
    }

    cancelEditButton.addEventListener('click', () => {
        resetForm(true);
    });

    // --- Recording Logic ---
    recordButton.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });

            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener('stop', () => {
                audioBlob = new Blob(audioChunks, { type: selectedMimeType });
                const audioUrl = URL.createObjectURL(audioBlob);
                audioPlayback.src = audioUrl;

                playbackSection.classList.remove('hidden');
                annotationSection.classList.remove('hidden');
                status.textContent = '录音完成。请试听并添加标注。';
                recordButton.disabled = true; // 录音完成后禁用开始录音按钮
                reRecordButton.classList.remove('hidden'); // 显示重新录音按钮
            });

            recordButton.disabled = true;
            stopButton.disabled = false;
            reRecordButton.classList.add('hidden'); // 录音时隐藏重新录音按钮
            status.textContent = '正在录音...';
            audioChunks = [];

            mediaRecorder.start();

        } catch (err) {
            console.error('Error accessing microphone:', err);
            status.textContent = '错误：无法访问麦克风。请检查权限。';
        }
    });

    stopButton.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            stopButton.disabled = true;
        }
    });

    reRecordButton.addEventListener('click', () => {
        resetForm(true); // 重置表单和录音状态
    });


    // --- Form Submission (Save/Update) ---
    annotationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const basename = editingBasenameInput.value;
        const isEditing = !!basename;

        if (!isEditing && !audioBlob) {
            alert('请先录制一段音频。');
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = isEditing ? '正在更新...' : '正在保存...';

        // 1. Get annotation data
        const form = new FormData(annotationForm);
        const soundCheckboxes = form.getAll('sound');
        const annotationData = {
            sound_description: soundCheckboxes,
            ripeness_score: parseInt(form.get('ripenessScore'), 10),
            prediction: form.get('prediction'),
            notes: form.get('notes'),
            ground_truth: form.get('groundTruth'),
            timestamp: new Date().toISOString()
        };

        try {
            let response;
            if (isEditing) {
                // --- UPDATE existing record ---
                response = await fetch(`/api/data/${basename}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ annotations: annotationData })
                });
            } else {
                // --- CREATE new record ---
                const serverFormData = new FormData();
                // 根据实际使用的 MIME 类型设置文件名扩展
                const audioFileExtension = selectedMimeType.split('/')[1]; // e.g., 'wav' or 'mp4'
                const audioFileName = `audio.${audioFileExtension}`;
                serverFormData.append('audio', audioBlob, audioFileName);
                serverFormData.append('annotations', JSON.stringify(annotationData));
                serverFormData.append('mimeType', selectedMimeType);
                response = await fetch('/api/save-data', {
                    method: 'POST',
                    body: serverFormData
                });
            }

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || '服务器返回错误');
            }

            alert(`数据${isEditing ? '更新' : '保存'}成功！`);
            resetForm(true);
            loadDataRecords(); // Refresh the list

        } catch (error) {
            console.error('Error saving data:', error);
            alert(`保存失败: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = '保存数据';
        }
    });
    
    function resetForm(hideForm) {
        annotationForm.reset();
        scoreOutput.textContent = '5';
        editingBasenameInput.value = '';
        formTitle.textContent = '1. 录制新数据';
        saveButton.textContent = '保存数据';
        cancelEditButton.classList.add('hidden');
        recordButton.disabled = false; // 确保开始录音按钮可用
        stopButton.disabled = true; // 停止录音按钮禁用
        reRecordButton.classList.add('hidden'); // 隐藏重新录音按钮

        if(hideForm) {
            playbackSection.classList.add('hidden');
            annotationSection.classList.add('hidden');
        }
        
        status.textContent = '请点击“开始录音”，然后敲击西瓜';
        audioBlob = null;
        audioChunks = [];
    }

    // Initial load
    initialize();
});
