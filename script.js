// 상태 관리 (더미 데이터 없이 localStorage에서만 불러옴)
let words = JSON.parse(localStorage.getItem('words')) || [];
let history = JSON.parse(localStorage.getItem('history')) || [];

// 현재 테스트 상태
let currentTest = { words: [], currentIndex: 0, answers: [] };
// 현재 수정 중인 단어 상태
let editingWordId = null;
let pendingEditData = null; // 영어단어 변경 경고창 대기 데이터

// 데이터 저장 유틸
const saveData = () => {
    localStorage.setItem('words', JSON.stringify(words));
    localStorage.setItem('history', JSON.stringify(history));
};

// 라우터 (화면 전환)
const router = (viewName) => {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');

    if (viewName === 'manage') renderWordList();
    if (viewName === 'history') renderHistoryList();
    if (viewName === 'test') initTest();
};

/* ================= 단어 관리 로직 ================= */
const renderWordList = () => {
    const listEl = document.getElementById('word-list');
    const sortType = document.getElementById('sort-select').value;
    
    let sortedWords = [...words].sort((a, b) => {
        if (sortType === 'alphabet') return a.en.localeCompare(b.en);
        if (sortType === 'accuracy') {
            const getRate = w => (w.correct + w.wrong) === 0 ? 0 : w.correct / (w.correct + w.wrong);
            return getRate(b) - getRate(a);
        }
        return b.createdAt - a.createdAt; // newest
    });

    listEl.innerHTML = '';
    sortedWords.forEach(word => {
        const total = word.correct + word.wrong;
        const rate = total === 0 ? 0 : Math.round((word.correct / total) * 100);
        
        const li = document.createElement('li');
        li.className = 'list-item';
        li.onclick = (e) => { if(!e.target.classList.contains('delete-btn')) openWordModal(word.id); };
        
        li.innerHTML = `
            <div class="item-info">
                <h4>${word.en}</h4>
                <p>${word.ko}</p>
            </div>
            <div class="item-stats">
                <p class="rate">정답률 ${rate}%</p>
                <button class="delete-btn" onclick="deleteWord('${word.id}', event)">✖</button>
            </div>
        `;
        listEl.appendChild(li);
    });
};

const deleteWord = (id, event) => {
    event.stopPropagation();
    if(confirm('단어를 삭제하시겠습니까?')) {
        words = words.filter(w => w.id !== id);
        saveData();
        renderWordList();
    }
};

/* ================= 모달 (추가/수정) 로직 ================= */
const openWordModal = (id = null) => {
    editingWordId = id;
    const modalTitle = document.getElementById('modal-title');
    const saveBtn = document.getElementById('modal-save-btn');
    const enInput = document.getElementById('modal-en');
    const koInput = document.getElementById('modal-ko');

    if (id) {
        const word = words.find(w => w.id === id);
        modalTitle.innerText = '단어 수정';
        saveBtn.innerText = '수정';
        enInput.value = word.en;
        koInput.value = word.ko;
    } else {
        modalTitle.innerText = '단어 추가';
        saveBtn.innerText = '추가';
        enInput.value = '';
        koInput.value = '';
    }
    document.getElementById('word-modal').classList.remove('hidden');
};

const closeWordModal = () => {
    document.getElementById('word-modal').classList.add('hidden');
    editingWordId = null;
};

const saveWord = () => {
    const en = document.getElementById('modal-en').value.trim();
    const ko = document.getElementById('modal-ko').value.trim();
    if (!en || !ko) return alert('영어와 한글 뜻을 모두 입력해주세요.');

    if (editingWordId) {
        // 수정 모드
        const oldWord = words.find(w => w.id === editingWordId);
        if (oldWord.en !== en) {
            // 영단어가 변경된 경우 경고창 출력
            pendingEditData = { en, ko };
            document.getElementById('alert-modal').classList.remove('hidden');
            return; // 기존 모달 닫지 않고 대기
        } else {
            // 한글 뜻만 변경
            oldWord.ko = ko;
        }
    } else {
        // 신규 추가
        words.push({ id: Date.now().toString(), en, ko, correct: 0, wrong: 0, createdAt: Date.now() });
    }
    
    saveData();
    renderWordList();
    closeWordModal();
};

/* ================= 경고 모달 로직 ================= */
const cancelAlert = () => {
    document.getElementById('alert-modal').classList.add('hidden');
    pendingEditData = null;
    // 경고창만 닫고 수정창은 유지됨
};

const confirmAlert = () => {
    // 영단어 변경 확정 (정답률 초기화 및 새로 등록 효과)
    const wordIndex = words.findIndex(w => w.id === editingWordId);
    words[wordIndex] = {
        ...words[wordIndex],
        en: pendingEditData.en,
        ko: pendingEditData.ko,
        correct: 0, 
        wrong: 0,
        createdAt: Date.now()
    };
    
    saveData();
    renderWordList();
    
    document.getElementById('alert-modal').classList.add('hidden');
    closeWordModal();
    pendingEditData = null;
};

/* ================= 테스트 로직 ================= */
const initTest = () => {
    if (words.length === 0) {
        document.getElementById('test-container').classList.add('hidden');
        document.getElementById('test-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('test-container').classList.remove('hidden');
    document.getElementById('test-empty').classList.add('hidden');

    // 단어 섞어서 최대 10개 추출
    let shuffled = [...words].sort(() => 0.5 - Math.random());
    currentTest.words = shuffled.slice(0, 10);
    currentTest.currentIndex = 0;
    currentTest.answers = [];
    
    showTestQuestion();
};

const showTestQuestion = () => {
    const word = currentTest.words[currentTest.currentIndex];
    document.getElementById('test-progress').innerText = `문제 ${currentTest.currentIndex + 1} / ${currentTest.words.length}`;
    document.getElementById('test-word').innerText = word.en;
    document.getElementById('test-answer').value = '';
    document.getElementById('test-answer').focus();
};

const submitAnswer = () => {
    const input = document.getElementById('test-answer').value.trim();
    if (!input) return;

    const word = currentTest.words[currentTest.currentIndex];
    const isCorrect = input === word.ko;
    
    currentTest.answers.push({ ...word, userAnswer: input, isCorrect });
    
    currentTest.currentIndex++;
    if (currentTest.currentIndex < currentTest.words.length) {
        showTestQuestion();
    } else {
        finishTest();
    }
};

const finishTest = () => {
    const total = currentTest.answers.length;
    const correctCount = currentTest.answers.filter(a => a.isCorrect).length;
    const rate = Math.round((correctCount / total) * 100);

    // 단어 DB 통계 업데이트
    currentTest.answers.forEach(ans => {
        const dbWord = words.find(w => w.id === ans.id);
        if (dbWord) { // 삭제된 상태가 아니라면
            ans.isCorrect ? dbWord.correct++ : dbWord.wrong++;
        }
    });

    // 히스토리 저장
    const historyObj = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('ko-KR'),
        total, correct: correctCount, rate,
        details: currentTest.answers
    };
    history.unshift(historyObj); // 최신순
    saveData();

    // 결과 렌더링
    renderResultView(historyObj);
    router('result');
};

/* ================= 테스트 기록 및 결과 로직 ================= */
const renderHistoryList = () => {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';
    
    if(history.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; padding: 20px;">테스트 기록이 없습니다.</p>';
        return;
    }

    history.forEach(hist => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.onclick = () => { renderResultView(hist); router('result'); };
        li.innerHTML = `
            <div class="item-info">
                <h4>${hist.date}</h4>
                <p>총 ${hist.total}문제 / 정답 ${hist.correct}개</p>
            </div>
            <div class="item-stats">
                <p class="rate">${hist.rate}%</p>
            </div>
        `;
        listEl.appendChild(li);
    });
};

const renderResultView = (histObj) => {
    document.getElementById('res-total').innerText = histObj.total;
    document.getElementById('res-correct').innerText = histObj.correct;
    document.getElementById('res-rate').innerText = histObj.rate;
    document.getElementById('result-title').innerText = histObj.date === history[0]?.date ? "테스트 완료!" : "상세 결과";

    const listEl = document.getElementById('result-list');
    listEl.innerHTML = '';
    
    histObj.details.forEach(detail => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.style.cursor = 'default';
        li.innerHTML = `
            <div class="item-info">
                <h4 style="color: ${detail.isCorrect ? '#10B981' : 'var(--danger)'}">${detail.en}</h4>
                <p>정답: ${detail.ko} (제출: ${detail.userAnswer})</p>
            </div>
            <div class="item-stats">
                <strong class="${detail.isCorrect ? 'res-correct' : 'res-wrong'}">${detail.isCorrect ? 'O' : 'X'}</strong>
            </div>
        `;
        listEl.appendChild(li);
    });
};