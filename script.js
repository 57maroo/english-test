// 1. Firebase 초기화 및 설정 (제공해주신 URL 포함)
const firebaseConfig = {
    apiKey: "AIzaSyAZvJPSOZ3PC7aowP9ueB_usCEzd3UxjwE",
    authDomain: "english-test-49e71.firebaseapp.com",
    databaseURL: "https://english-test-49e71-default-rtdb.firebaseio.com",
    projectId: "english-test-49e71",
    storageBucket: "english-test-49e71.firebasestorage.app",
    messagingSenderId: "605160387541",
    appId: "1:605160387541:web:390b947b22dd57737c435c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database(); // Realtime Database 객체

// 2. 전역 상태 관리
let words = [];
let history = [];
let currentTest = { words: [], currentIndex: 0, answers: [] };
let editingWordId = null;
let pendingEditData = null;

// 3. 앱 실행 시 Firebase에서 데이터 불러오기 (RTDB 방식)
async function fetchFirebaseData() {
    try {
        // 단어 데이터 가져오기
        const wordSnap = await db.ref('words').once('value');
        const wordData = wordSnap.val() || {};
        // 고유 Key를 id 속성으로 변환하여 배열로 만듦
        words = Object.keys(wordData).map(key => ({ id: key, ...wordData[key] }));

        // 기록 데이터 가져오기
        const historySnap = await db.ref('history').once('value');
        const historyData = historySnap.val() || {};
        history = Object.keys(historyData).map(key => ({ id: key, ...historyData[key] }));
        
        // 기록을 최신순(내림차순)으로 로컬에서 정렬
        history.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
        console.error("데이터 불러오기 실패:", error);
    }
}
fetchFirebaseData();

// ================= 라우터 =================
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
        return b.createdAt - a.createdAt; // 최신순 정렬
    });

    listEl.innerHTML = '';
    sortedWords.forEach(word => {
        const total = word.correct + word.wrong;
        const rate = total === 0 ? 0 : Math.round((word.correct / total) * 100);
        
        const li = document.createElement('li');
        li.className = 'list-item';
        li.onclick = (e) => { if(!e.target.closest('.delete-btn')) openWordModal(word.id); };
        
        li.innerHTML = `
            <div class="item-info">
                <h4>${word.en}</h4>
                <p>${word.ko}</p>
            </div>
            <div class="item-stats">
                <span class="rate">정답률 ${rate}%</span>
                <button class="delete-btn" onclick="deleteWord('${word.id}', event)">✖</button>
            </div>
        `;
        listEl.appendChild(li);
    });
};

const deleteWord = async (id, event) => {
    event.stopPropagation();
    if(confirm('단어를 삭제하시겠습니까?')) {
        try {
            await db.ref(`words/${id}`).remove(); // RTDB 삭제 방식
            words = words.filter(w => w.id !== id);
            renderWordList();
        } catch (error) {
            console.error("삭제 실패:", error);
            alert("단어 삭제에 실패했습니다.");
        }
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
    
    // 모달을 열 때마다 잠금 상태 해제 보장
    enInput.disabled = false;
    koInput.disabled = false;
    saveBtn.disabled = false;

    document.getElementById('word-modal').classList.remove('hidden');
    enInput.focus();
};

const closeWordModal = () => {
    document.getElementById('word-modal').classList.add('hidden');
    editingWordId = null;
};

const saveWord = async () => {
    const enInput = document.getElementById('modal-en');
    const koInput = document.getElementById('modal-ko');
    const saveBtn = document.getElementById('modal-save-btn');
    const en = enInput.value.trim();
    const ko = koInput.value.trim();
    
    if (!en || !ko) return alert('영어와 한글 뜻을 모두 입력해주세요.');
    
    // 버튼 및 필드 잠금 (이전 버그 해결 코드 적용)
    enInput.disabled = true; 
    koInput.disabled = true;
    saveBtn.disabled = true;

    try {
        if (editingWordId) {
            const oldWord = words.find(w => w.id === editingWordId);
            if (oldWord.en !== en) {
                // 영어 단어 변경됨: 경고 모달 출력 (잠금은 finally에서 해제)
                pendingEditData = { en, ko };
                document.getElementById('alert-modal').classList.remove('hidden');
                return; 
            } else {
                // 한글 뜻만 변경됨 (RTDB update)
                await db.ref(`words/${editingWordId}`).update({ ko: ko });
                oldWord.ko = ko;
                renderWordList();
                closeWordModal();
            }
        } else {
            // 신규 단어 추가 (RTDB push)
            const newRef = db.ref('words').push(); // 새 고유 키 생성
            const newWord = { en, ko, correct: 0, wrong: 0, createdAt: Date.now() };
            await newRef.set(newWord);
            
            words.push({ id: newRef.key, ...newWord });
            renderWordList();
            closeWordModal();
        }
    } catch (error) {
        console.error("단어 저장 중 오류:", error);
        alert("데이터 저장에 실패했습니다. 네트워크 상태나 규칙을 확인해주세요.");
    } finally {
        // 오류 유무와 상관없이 입력 필드 잠금 해제
        enInput.disabled = false; 
        koInput.disabled = false;
        saveBtn.disabled = false;
    }
};

/* ================= 경고 모달 로직 ================= */
const cancelAlert = () => {
    document.getElementById('alert-modal').classList.add('hidden');
    pendingEditData = null;
};

const confirmAlert = async () => {
    const wordIndex = words.findIndex(w => w.id === editingWordId);
    const updatedData = {
        en: pendingEditData.en,
        ko: pendingEditData.ko,
        correct: 0, 
        wrong: 0,
        createdAt: Date.now()
    };
    
    try {
        // 단어 덮어쓰기 (정답률 초기화 효과)
        await db.ref(`words/${editingWordId}`).update(updatedData);
        
        words[wordIndex] = { ...words[wordIndex], ...updatedData };
        renderWordList();
        
        document.getElementById('alert-modal').classList.add('hidden');
        closeWordModal();
        pendingEditData = null;
    } catch (error) {
        console.error("초기화 저장 실패:", error);
        alert("단어 변경에 실패했습니다.");
    }
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
    
    currentTest.answers.push({ 
        wordId: word.id, 
        en: word.en, 
        ko: word.ko, 
        userAnswer: input, 
        isCorrect 
    });
    
    currentTest.currentIndex++;
    if (currentTest.currentIndex < currentTest.words.length) {
        showTestQuestion();
    } else {
        finishTest();
    }
};

const finishTest = async () => {
    const total = currentTest.answers.length;
    const correctCount = currentTest.answers.filter(a => a.isCorrect).length;
    const rate = Math.round((correctCount / total) * 100);

    const historyObj = {
        createdAt: Date.now(),
        date: new Date().toLocaleString('ko-KR'),
        total, correct: correctCount, rate,
        details: currentTest.answers
    };

    try {
        // [Firebase RTDB] Multipath Update (여러 경로 동시 업데이트 트랜잭션)
        const updates = {};
        
        // 1. History 문서 새로 생성할 키값 추출
        const newHistKey = db.ref('history').push().key;
        updates[`/history/${newHistKey}`] = historyObj;

        // 2. 출제된 단어들의 정답/오답 통계 1씩 증가시키기
        currentTest.answers.forEach(ans => {
            if (ans.isCorrect) {
                updates[`/words/${ans.wordId}/correct`] = firebase.database.ServerValue.increment(1);
            } else {
                updates[`/words/${ans.wordId}/wrong`] = firebase.database.ServerValue.increment(1);
            }
        });

        // 3. 서버에 일괄 적용
        await db.ref().update(updates);

        // [Local] 로컬 상태 동기화 (새로고침 없이 화면 반영)
        historyObj.id = newHistKey;
        history.unshift(historyObj);

        currentTest.answers.forEach(ans => {
            const dbWord = words.find(w => w.id === ans.wordId);
            if (dbWord) { 
                ans.isCorrect ? dbWord.correct++ : dbWord.wrong++;
            }
        });

        renderResultView(historyObj);
        router('result');

    } catch (error) {
        console.error("테스트 결과 저장 실패:", error);
        alert("결과 저장 중 오류가 발생했습니다.");
    }
};

/* ================= 테스트 기록 및 결과 로직 ================= */
const renderHistoryList = () => {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';
    
    if(history.length === 0) {
        listEl.innerHTML = '<p class="empty-state">아직 테스트 기록이 없습니다.</p>';
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
                <span class="rate">${hist.rate}%</span>
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