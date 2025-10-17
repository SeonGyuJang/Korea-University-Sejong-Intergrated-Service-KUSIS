/* ================================================== */
/* 시간표 관리 v2 (timetable_management_v2.js)          */
/* ================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let allSemesters = [];
    let currentSubjects = []; // 현재 선택된 학기의 과목 목록
    let gpaChartInstance = null;
    const GRADE_MAP = { "A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0, "P": -1, "Not Set": -1 };

    // --- DOM 요소 캐싱 ---
    const semesterSelect = document.getElementById('semesterSelect');
    const addSemesterBtn = document.getElementById('addSemesterBtn'); // 학기 추가 버튼
    const timetableBody = document.getElementById('timetableEditorBody');
    const todoSummaryList = document.getElementById('todoSummaryList');
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    const currentCreditsEl = document.getElementById('currentCredits');
    const goalCreditsEl = document.getElementById('goalCredits');
    const remainingCreditsEl = document.getElementById('remainingCredits');
    const creditProgressCircle = document.getElementById('creditProgress');
    const creditPercentageEl = document.getElementById('creditPercentage');
    const overallGpaEl = document.getElementById('overallGpa'); // 전체 평점 표시 요소
    const editGoalBtn = document.getElementById('editGoalBtn');
    const editGoalForm = document.getElementById('editGoalForm');
    const newGoalInput = document.getElementById('newGoalCredits');
    const saveGoalBtn = document.getElementById('saveGoalBtn');
    const cancelGoalBtn = document.getElementById('cancelGoalBtn');
    const gpaChartCanvas = document.getElementById('gpaChart');
    const refreshGpaChartBtn = document.getElementById('refreshGpaChartBtn'); // GPA 차트 새로고침 버튼

    // 과목 수정 모달 DOM
    const subjectModal = document.getElementById('subjectEditModal');
    const modalTitle = document.getElementById('subjectModalTitle');
    const subjectForm = document.getElementById('subjectEditForm');
    const subjectIdInput = document.getElementById('subjectId');
    const subjectSemesterIdInput = document.getElementById('subjectSemesterId');
    const nameInput = document.getElementById('subjectName');
    const profInput = document.getElementById('subjectProfessor');
    const creditsInput = document.getElementById('subjectCredits');
    const gradeInput = document.getElementById('subjectGrade');
    const memoTextInput = document.getElementById('memoText');
    const todoListUl = document.getElementById('memoTodoList');
    const todoNewInput = document.getElementById('memoNewTodoInput');
    const todoAddBtn = document.getElementById('memoAddTodoBtn');
    const timeSlotContainer = document.getElementById('timeSlotContainer');
    const addTimeSlotBtn = document.getElementById('addTimeSlotBtn');
    const saveSubjectBtn = document.getElementById('saveSubjectBtn');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');

    // 학기 추가 모달 DOM
    const addSemesterModal = document.getElementById('addSemesterModal');
    const addSemesterForm = document.getElementById('addSemesterForm');
    const semesterNameInput = document.getElementById('semesterName');
    const semesterYearInput = document.getElementById('semesterYear');
    const semesterSeasonInput = document.getElementById('semesterSeason');
    const saveSemesterBtn = document.getElementById('saveSemesterBtn');


    // --- 1. 초기화 ---
    function initializePage() {
        setupEventListeners();

        // HTML에서 주입된 데이터 사용
        allSemesters = ALL_SEMESTERS_DATA || [];
        currentSemesterId = INITIAL_SEMESTER_ID;
        currentSubjects = INITIAL_SUBJECTS_DATA || [];

        // 학기 드롭다운 채우기
        populateSemesterDropdown();

        // 초기 시간표 및 Todo 렌더링
        if (currentSemesterId) {
            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
        } else {
            clearTimetableGrid();
            renderTodoSummary([]);
            todoSummaryList.innerHTML = '<p class="todo-summary-empty">표시할 학기 정보가 없습니다. 학기를 먼저 추가해주세요.</p>';
            addSubjectBtn.disabled = true; // 학기가 없으면 과목 추가 불가
        }

        // GPA 그래프 로드 (이제 API 호출)
        loadGpaStats();

        // 학점 위젯 초기화 (HTML의 정적 데이터 사용)
        updateCreditProgress(
            parseInt(currentCreditsEl.textContent, 10),
            parseInt(goalCreditsEl.textContent, 10)
        );
    }

    // --- 2. 이벤트 리스너 설정 ---
    function setupEventListeners() {
        semesterSelect.addEventListener('change', handleSemesterChange);
        addSemesterBtn.addEventListener('click', openAddSemesterModal);
        addSubjectBtn.addEventListener('click', openSubjectModalForCreate);
        addTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry());
        todoAddBtn.addEventListener('click', addTodoItem);
        todoNewInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTodoItem(); } });
        saveSubjectBtn.addEventListener('click', saveSubject);
        deleteSubjectBtn.addEventListener('click', deleteSubject);
        subjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => subjectModal.classList.remove('active')));
        editGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'block'; editGoalBtn.style.display = 'none'; });
        cancelGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block'; newGoalInput.value = goalCreditsEl.textContent; });
        saveGoalBtn.addEventListener('click', saveCreditGoal);
        refreshGpaChartBtn.addEventListener('click', loadGpaStats); // GPA 차트 새로고침
        saveSemesterBtn.addEventListener('click', saveNewSemester); // 학기 저장
        addSemesterModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => addSemesterModal.classList.remove('active')));
    }

    // --- 3. 데이터 로딩 (API 호출) ---

    // (수정) 학기 변경 시 API 호출 함수
    async function handleSemesterChange() {
        const selectedId = parseInt(semesterSelect.value, 10);
        if (selectedId && selectedId !== currentSemesterId) {
            currentSemesterId = selectedId;
            await loadTimetableForSemester(currentSemesterId);
        }
    }

    // (수정) 특정 학기의 시간표 데이터 로드 (API 호출 - 학기 변경 시 사용)
    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableGrid();
            renderTodoSummary([]);
            return;
        }
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();
            currentSubjects = data.subjects || []; // 전역 변수 업데이트
            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
        } catch (error) {
            console.error(error);
            clearTimetableGrid();
            renderTodoSummary([]);
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">${error.message}</td></tr>`;
        }
    }

    // (수정) 학기별 GPA 통계 로드 및 차트 렌더링 (API 호출)
    async function loadGpaStats() {
        if (!gpaChartCanvas) return;
        try {
            const response = await fetch('/api/gpa-stats');
            if (!response.ok) throw new Error(`GPA 통계 로드 실패 (${response.status})`);
            const statsData = await response.json();

            // 학점 위젯 업데이트
            currentCreditsEl.textContent = statsData.total_earned_credits;
            overallGpaEl.textContent = statsData.overall_gpa;
            updateCreditProgress(statsData.total_earned_credits, parseInt(goalCreditsEl.textContent, 10));


            // 차트 데이터 준비
            const labels = statsData.semesters.map(s => s.semester_name);
            const gpaValues = statsData.semesters.map(s => s.gpa);

            if (gpaChartInstance) {
                gpaChartInstance.destroy();
            }

            gpaChartInstance = new Chart(gpaChartCanvas, {
                type: 'line', // 라인 차트로 변경
                data: {
                    labels: labels,
                    datasets: [{
                        label: '학기별 평점(GPA)',
                        data: gpaValues,
                        backgroundColor: 'rgba(165, 0, 52, 0.1)',
                        borderColor: 'rgba(165, 0, 52, 1)',
                        borderWidth: 2,
                        tension: 0.1,
                        fill: true // 라인 아래 영역 채우기
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, max: 4.5 } },
                    plugins: { tooltip: { mode: 'index', intersect: false } }
                }
            });

        } catch (error) {
            console.error(error);
            // 오류 메시지 표시 (옵션)
            const ctx = gpaChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, gpaChartCanvas.width, gpaChartCanvas.height);
            ctx.fillStyle = 'grey';
            ctx.textAlign = 'center';
            ctx.fillText(error.message, gpaChartCanvas.width / 2, gpaChartCanvas.height / 2);
        }
    }

    // --- 4. 렌더링 함수 ---

    // (신규) 학기 드롭다운 채우기
    function populateSemesterDropdown() {
        semesterSelect.innerHTML = ''; // 기존 옵션 제거
        if (allSemesters.length > 0) {
            allSemesters.forEach(s => {
                const option = new Option(s.name, s.id);
                option.selected = (s.id === currentSemesterId);
                semesterSelect.add(option);
            });
            addSubjectBtn.disabled = false; // 학기가 있으니 과목 추가 가능
        } else {
            semesterSelect.innerHTML = '<option value="">학기 없음</option>';
            addSubjectBtn.disabled = true;
        }
    }

    // (수정) 시간표 그리드 렌더링 (유연한 시간 지원 + 버그 수정)
    function renderTimetableGrid(subjects) {
        timetableBody.innerHTML = '';
        const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17'];
        hours.forEach(hour => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${hour}:00</td>
                <td data-day="1" data-hour="${hour}" style="position: relative;"></td>
                <td data-day="2" data-hour="${hour}" style="position: relative;"></td>
                <td data-day="3" data-hour="${hour}" style="position: relative;"></td>
                <td data-day="4" data-hour="${hour}" style="position: relative;"></td>
                <td data-day="5" data-hour="${hour}" style="position: relative;"></td>
            `;
            timetableBody.appendChild(row);
        });

        // 테이블 렌더링 후 슬롯 배치 (offsetHeight 계산 위해)
        requestAnimationFrame(() => { // 브라우저가 레이아웃을 계산한 후 실행
            const firstRowCells = timetableBody.querySelectorAll('tr:first-child td:not(:first-child)');
            if (firstRowCells.length === 0) return;
            const cellHeight = firstRowCells[0].offsetHeight; // 첫 번째 시간대 셀의 높이 기준
             if (!cellHeight || cellHeight === 0) {
                 console.warn("Cell height is 0, cannot position slots.");
                 return;
             }

            subjects.forEach(subject => {
                subject.timeslots.forEach(ts => {
                    const startHour = parseInt(ts.start.split(':')[0]);
                    const startMinute = parseInt(ts.start.split(':')[1]);
                    const endHour = parseInt(ts.end.split(':')[0]);
                    const endMinute = parseInt(ts.end.split(':')[1]);

                    // 시작 시간대가 속한 셀 찾기 (9시 이전 시작은 9시 셀에 표시)
                    const targetHour = Math.max(9, startHour);
                    const cell = timetableBody.querySelector(`td[data-day="${ts.day}"][data-hour="${String(targetHour).padStart(2, '0')}"]`);

                    if (!cell) {
                         console.warn(`Cell not found for day ${ts.day}, hour ${targetHour}`);
                         return;
                    }

                    const minutesPerHour = 60;
                    // 셀 시작 시간 기준 offset 계산 (e.g., 9시 셀에서 9:30 시작이면 30분 offset)
                    const startOffsetMinutes = Math.max(0, (startHour * 60 + startMinute) - (targetHour * 60));
                    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

                    const topOffset = (startOffsetMinutes / minutesPerHour) * cellHeight;
                    const slotHeight = (durationMinutes / minutesPerHour) * cellHeight;

                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.position = 'absolute'; // 절대 위치 사용
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight}px`;
                    slotDiv.style.left = '2px'; // 셀 내부 좌우 여백
                    slotDiv.style.right = '2px';

                    slotDiv.innerHTML = `
                        <div class="slot-subject">${subject.name}</div>
                        <div class="slot-room">${ts.room || ''}</div>
                    `;
                    slotDiv.addEventListener('click', () => openSubjectModalForEdit(subject.id));
                    cell.appendChild(slotDiv);
                });
            });
        });
    }


    function clearTimetableGrid() {
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">표시할 시간표가 없습니다.</td></tr>`;
    }

    // (수정) Todo 요약 렌더링 (이전과 유사, currentSubjects 사용)
    function renderTodoSummary(subjects) {
        todoSummaryList.innerHTML = '';
        const subjectsWithTodos = subjects.filter(item => item.memo && item.memo.todos && item.memo.todos.length > 0);

        if (subjectsWithTodos.length === 0) {
            todoSummaryList.innerHTML = '<p class="todo-summary-empty">이번 학기 Todo가 없습니다.</p>';
            return;
        }

        subjectsWithTodos.forEach(item => {
            const pendingTodos = item.memo.todos.filter(t => !t.done);
            const isCompleted = pendingTodos.length === 0;
            const itemDiv = document.createElement('div');
            itemDiv.className = isCompleted ? 'todo-summary-item completed' : 'todo-summary-item';
            let todoHtml = '<ul class="todo-list">';
            item.memo.todos.forEach(todo => {
                todoHtml += `<li class="todo-list-item ${todo.done ? 'done' : 'pending'}"><i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}"></i> ${todo.task}</li>`;
            });
            todoHtml += '</ul>';
            itemDiv.innerHTML = `<div class="todo-subject"><i class="fas fa-book"></i> ${item.name} (${isCompleted ? '완료' : `${pendingTodos.length}개 남음`})</div> ${todoHtml}`;
            todoSummaryList.appendChild(itemDiv);
        });
    }

    // --- 5. 학점 위젯 로직 ---
    function updateCreditProgress(current, goal) {
         const remaining = Math.max(0, goal - current);
         const percentage = (goal > 0) ? Math.min(100, (current / goal) * 100) : 0;
         const circumference = 2 * Math.PI * 45; // circle r="45"
         const dashoffset = circumference - (circumference * percentage / 100);

         //currentCreditsEl.textContent = current; // GPA API에서 업데이트
         goalCreditsEl.textContent = goal;
         remainingCreditsEl.textContent = remaining;
         creditPercentageEl.textContent = `${Math.round(percentage)}%`;
         if (creditProgressCircle) { creditProgressCircle.style.strokeDashoffset = dashoffset; }
    }

    async function saveCreditGoal() {
        // ... (이전과 동일) ...
        const newGoal = parseInt(newGoalInput.value, 10);
        if (isNaN(newGoal) || newGoal <= 0) { alert('유효한 학점을 입력하세요 (1 이상).'); return; }
        saveGoalBtn.disabled = true;
        try {
            const response = await fetch('/api/credits/goal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: newGoal }) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            updateCreditProgress( parseInt(currentCreditsEl.textContent, 10), result.new_goal);
            editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block';
        } catch (error) { alert(`목표 학점 저장 실패: ${error.message}`);
        } finally { saveGoalBtn.disabled = false; }
    }


    // --- 6. 과목 수정 모달 로직 ---
    function openSubjectModalForCreate() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 먼저 선택하거나 생성해주세요."); return; }
        subjectForm.reset();
        subjectIdInput.value = '';
        subjectSemesterIdInput.value = currentSemesterId;
        modalTitle.textContent = "새 과목 추가";
        deleteSubjectBtn.style.display = 'none';
        timeSlotContainer.innerHTML = '';
        createTimeSlotEntry(); // 기본 1개 추가
        renderTodoListInModal([]); // 모달 내 Todo 초기화
        memoTextInput.value = '';
        gradeInput.value = 'Not Set'; // 등급 초기화
        subjectModal.classList.add('active');
    }

    function openSubjectModalForEdit(subjectId) {
        const subject = currentSubjects.find(s => s.id === subjectId);
        if (!subject) return;
        subjectForm.reset();
        modalTitle.textContent = "과목 수정";
        deleteSubjectBtn.style.display = 'block';
        subjectIdInput.value = subject.id;
        subjectSemesterIdInput.value = currentSemesterId;
        nameInput.value = subject.name;
        profInput.value = subject.professor;
        creditsInput.value = subject.credits;
        gradeInput.value = subject.grade || "Not Set";
        timeSlotContainer.innerHTML = '';
        if (subject.timeslots.length > 0) { subject.timeslots.forEach(ts => createTimeSlotEntry(ts)); }
        else { createTimeSlotEntry(); }
        const memo = subject.memo || { note: '', todos: [] };
        memoTextInput.value = memo.note || '';
        renderTodoListInModal(memo.todos || []); // 모달 내 Todo 렌더링
        subjectModal.classList.add('active');
    }

    function createTimeSlotEntry(timeslot = null) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        entryDiv.innerHTML = `
            <select name="day"> <option value="1">월</option><option value="2">화</option><option value="3">수</option><option value="4">목</option><option value="5">금</option> </select>
            <input type="time" name="start_time" value="${timeslot ? timeslot.start : '09:00'}">
            <input type="time" name="end_time" value="${timeslot ? timeslot.end : '10:15'}">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}">
            <button type="button" class="timeslot-delete-btn">&times;</button>
        `;
        if (timeslot) { entryDiv.querySelector('select[name="day"]').value = timeslot.day; }
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        timeSlotContainer.appendChild(entryDiv);
    }

    // (수정) 모달 내 Todo 리스트 렌더링 함수
    function renderTodoListInModal(todos) {
        todoListUl.innerHTML = '';
        if (!todos || todos.length === 0) {
            todoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
            return;
        }
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.className = todo.done ? 'todo-item done' : 'todo-item';
            // 고유 ID 생성 (삭제 시 필요)
            const todoId = `todo-${index}-${Date.now()}`;
            li.innerHTML = `
                <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
                <label for="${todoId}" class="todo-label">${todo.task}</label>
                <span class="todo-delete-btn" data-index="${index}">&times;</span>
            `;
            // 체크박스 변경 시 상태 업데이트 (DOM 직접 수정하지 않음, 저장 시 반영)
            li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                 li.classList.toggle('done', e.target.checked);
            });
            // 삭제 버튼
            li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
                 e.target.closest('li').remove(); // DOM에서 즉시 제거
                 if (todoListUl.children.length === 0) {
                      todoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
                 }
            });
            todoListUl.appendChild(li);
        });
    }

     // (수정) 모달 내 Todo 아이템 추가 함수
    function addTodoItem() {
        const taskText = todoNewInput.value.trim();
        if (taskText === '') return;

        const emptyMsg = todoListUl.querySelector('.todo-empty');
        if (emptyMsg) todoListUl.innerHTML = '';

        const index = todoListUl.children.length; // 새 인덱스
        const li = document.createElement('li');
        li.className = 'todo-item';
        const todoId = `todo-${index}-${Date.now()}`;
        li.innerHTML = `
            <input type="checkbox" id="${todoId}">
            <label for="${todoId}" class="todo-label">${taskText}</label>
            <span class="todo-delete-btn" data-index="${index}">&times;</span>
        `;
        li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            li.classList.toggle('done', e.target.checked);
        });
        li.querySelector('.todo-delete-btn').addEventListener('click', (e) => {
            e.target.closest('li').remove();
            if (todoListUl.children.length === 0) {
                 todoListUl.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
            }
        });
        todoListUl.appendChild(li);
        todoNewInput.value = '';
        todoNewInput.focus();
    }


    // --- 7. 과목 저장/삭제 API 호출 ---
    async function saveSubject() {
        // 1. 기본 정보 수집
        const subjectId = subjectIdInput.value;
        const isEditing = !!subjectId;
        const data = {
            semester_id: parseInt(subjectSemesterIdInput.value, 10),
            name: nameInput.value.trim(),
            professor: profInput.value.trim(),
            credits: parseInt(creditsInput.value, 10) || 0,
            grade: gradeInput.value,
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }
        if (!data.semester_id) { alert('오류: 학기 정보가 없습니다.'); return; }

        // 2. 타임슬롯 정보 수집
        data.timeslots = [];
        timeSlotContainer.querySelectorAll('.timeslot-entry').forEach(entry => {
            const day = entry.querySelector('select[name="day"]').value;
            const start = entry.querySelector('input[name="start_time"]').value;
            const end = entry.querySelector('input[name="end_time"]').value;
            if (day && start && end) { // 필수값 확인
                 data.timeslots.push({
                      day: parseInt(day, 10),
                      start: start,
                      end: end,
                      room: entry.querySelector('input[name="room"]').value.trim()
                 });
            }
        });

        // 3. 메모/Todo 정보 수집
        data.memo = {
            note: memoTextInput.value.trim(),
            todos: []
        };
        todoListUl.querySelectorAll('.todo-item').forEach(li => {
            const label = li.querySelector('.todo-label');
            const checkbox = li.querySelector('input[type="checkbox"]');
            if (label && checkbox) {
                 data.memo.todos.push({ task: label.textContent, done: checkbox.checked });
            }
        });

        // 4. API 호출
        const url = isEditing ? `/api/subjects/${subjectId}` : '/api/subjects';
        const method = isEditing ? 'PUT' : 'POST';
        saveSubjectBtn.disabled = true; saveSubjectBtn.textContent = '저장 중...';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || '저장 실패');

            // 성공 시 UI 업데이트
            subjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId); // 현재 학기 시간표 새로고침
            await loadGpaStats(); // 학점 위젯 및 GPA 차트 새로고침

        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveSubjectBtn.disabled = false; saveSubjectBtn.textContent = '저장';
        }
    }

    async function deleteSubject() {
        const subjectId = subjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까?')) return;

        deleteSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || '삭제 실패');

            subjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId);
            await loadGpaStats();

        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteSubjectBtn.disabled = false;
        }
    }

    // --- 8. 학기 추가 모달 로직 ---
    function openAddSemesterModal() {
        addSemesterForm.reset();
        // 현재 연도 자동 입력 (옵션)
        semesterYearInput.value = new Date().getFullYear();
        addSemesterModal.classList.add('active');
    }

    async function saveNewSemester() {
        const name = semesterNameInput.value.trim();
        const year = semesterYearInput.value;
        const season = semesterSeasonInput.value;
        if (!name || !year || !season) { alert("모든 필드를 입력해주세요."); return; }

        saveSemesterBtn.disabled = true; saveSemesterBtn.textContent = '추가 중...';
        try {
             const response = await fetch('/api/semesters', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ name, year: parseInt(year), season })
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message);

             // 성공 시: 새 학기 정보를 allSemesters에 추가하고 드롭다운 갱신
             allSemesters.unshift(result.semester); // 최신 학기이므로 맨 앞에 추가
             allSemesters.sort((a, b) => { // 이름 기준 내림차순 정렬 (최신순)
                 if (a.name > b.name) return -1;
                 if (a.name < b.name) return 1;
                 return 0;
             });
             currentSemesterId = result.semester.id; // 새로 추가된 학기를 현재 학기로 설정
             populateSemesterDropdown(); // 드롭다운 다시 그리기
             await loadTimetableForSemester(currentSemesterId); // 새 학기 시간표 로드 (빈 화면)
             addSemesterModal.classList.remove('active');

        } catch (error) {
            alert(`학기 추가 실패: ${error.message}`);
        } finally {
            saveSemesterBtn.disabled = false; saveSemesterBtn.textContent = '추가';
        }
    }

    // --- 페이지 초기화 실행 ---
    initializePage();
});