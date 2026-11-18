// 1. Firebase 초기화 및 설정
const firebaseConfig = {
    apiKey: "AIzaSyAZvJPSOZ3PC7aowP9ueB_usCEzd3UxjwE",
    authDomain: "english-test-49e71.firebaseapp.com",
    projectId: "english-test-49e71",
    storageBucket: "english-test-49e71.firebasestorage.app",
    messagingSenderId: "605160387541",
    appId: "1:605160387541:web:390b947b22dd57737c435c"
};

// Firebase 앱 및 Firestore DB 객체 생성
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. 전역 상태 관리
let words = [];
let history = [];
let currentTest = { words: [], currentIndex: 0, answers: [] };
let editingWordId = null;
let pendingEditData = null;

// 3. 앱 실행 시 Firebase에서 데이터 불러오기 (초기 1회 실행)
async function fetchFirebaseData() {
    try {
        // 단어장 가져오기 (오래된 순)
        const wordSnap = await db.collection('words').orderBy('createdAt', 'asc').get();
        words = wordSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 테스트 기록 가져오기 (최신 순)
        const historySnap = await db.collection('history').orderBy('createdAt', 'desc').get();
        history = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("데이터 불러오기 실패:", error);
    }
}
// 스크립트가 로드되자마자 데이터를 비동기로 불러옴
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
        return b.createdAt - a.createdAt; // newest (descending)
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
        // Firebase에서 삭제
        await db.collection('words').doc(id).delete();
        // 로컬 배열 업데이트
        words = words.filter(w => w.id !== id);
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
    enInput.focus();
};

const closeWordModal = () => {
    document.getElementById('word-modal').classList.add('hidden');
    editingWordId = null;
};

const saveWord = async () => {
    const enInput = document.getElementById('modal-en');
    const koInput = document.getElementById('modal-ko');
    const en = enInput.value.trim();
    const ko = koInput.value.trim();
    
    if (!en || !ko) return alert('영어와 한글 뜻을 모두 입력해주세요.');
    
    // 중복 클릭 방지
    enInput.disabled = true; koInput.disabled = true;

    try {
        if (editingWordId) {
            const oldWord = words.find(w => w.id === editingWordId);
            if (oldWord.en !== en) {
                // 영단어 변경: 경고창 출력
                pendingEditData = { en, ko };
                document.getElementById('alert-modal').classList.remove('hidden');
            } else {
                // 한글 뜻만 변경: Firestore 및 로컬 업데이트
                await db.collection('words').doc(editingWordId).update({ ko: ko });
                oldWord.ko = ko;
                renderWordList();
                closeWordModal();
            }
        } else {
            // 신규 단어 추가: Firestore에 등록 후 생성된 ID를 로컬에 반영
            const newWord = { en, ko, correct: 0, wrong: 0, createdAt: Date.now() };
            const docRef = await db.collection('words').add(newWord);
            words.push({ id: docRef.id, ...newWord });
            renderWordList();
            closeWordModal();
        }
    } catch (error) {
        console.error("단어 저장 중 오류:", error);
    } finally {
        enInput.disabled = false; koInput.disabled = false;
    }
};

/* ================= 경고 모달 로직 ================= */
const cancelAlert = () => {
    document.getElementById('alert-modal').classList.add('hidden');
    pendingEditData = null;
    document.getElementById('modal-en').disabled = false; 
    document.getElementById('modal-ko').disabled = false;
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
    
    // 기존 문서에 데이터 덮어쓰기 (정답률 초기화 효과)
    await db.collection('words').doc(editingWordId).update(updatedData);
    
    // 로컬 상태 동기화
    words[wordIndex] = { ...words[wordIndex], ...updatedData };
    
    renderWordList();
    document.getElementById('alert-modal').classList.add('hidden');
    closeWordModal();
    pendingEditData = null;
    document.getElementById('modal-en').disabled = false; 
    document.getElementById('modal-ko').disabled = false;
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
    
    // 테스트 배열에 저장 (Firebase 업로드를 위해 wordId 명시)
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
        // [Firebase] Batch Write: 테스트 히스토리 생성 + 여러 단어의 정답/오답수 일괄 업데이트
        const batch = db.batch();
        
        // 1. History 문서 추가
        const newHistoryRef = db.collection('history').doc();
        batch.set(newHistoryRef, historyObj);

        // 2. Words 문서 통계 증가
        currentTest.answers.forEach(ans => {
            const wordRef = db.collection('words').doc(ans.wordId);
            batch.update(wordRef, {
                correct: firebase.firestore.FieldValue.increment(ans.isCorrect ? 1 : 0),
                wrong: firebase.firestore.FieldValue.increment(ans.isCorrect ? 0 : 1)
            });
        });

        // 일괄 전송
        await batch.commit();

        // [Local] 로컬 상태 동기화 (새로고침 없이 화면 반영)
        historyObj.id = newHistoryRef.id;
        history.unshift(historyObj); // 맨 위에 추가

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