document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let allSemesters = [];
    let currentSubjects = [];
    let gpaChartInstance = null;

    // --- DOM 요소 캐싱 ---
    const semesterSelect = document.getElementById('semesterSelect');
    const timetableBody = document.getElementById('timetableEditorBody');
    const addSubjectBtn = document.getElementById('addSubjectBtn');

    // 사이드 위젯 DOM
    const creditProgressCircle = document.getElementById('creditProgress');
    const creditPercentageEl = document.getElementById('creditPercentage');
    const currentCreditsEl = document.getElementById('currentCredits');
    const goalCreditsEl = document.getElementById('goalCredits');
    const remainingCreditsEl = document.getElementById('remainingCredits');
    const overallGpaEl = document.getElementById('overallGpa');
    const editGoalBtn = document.getElementById('editGoalBtn');
    const editGoalForm = document.getElementById('editGoalForm');
    const newGoalInput = document.getElementById('newGoalCredits');
    const saveGoalBtn = document.getElementById('saveGoalBtn');
    const cancelGoalBtn = document.getElementById('cancelGoalBtn');
    const gpaChartCanvas = document.getElementById('gpaChart');
    const refreshGpaChartBtn = document.getElementById('refreshGpaChartBtn');
    const todoSummaryList = document.getElementById('todoSummaryList');

    // 탭 DOM
    document.querySelectorAll('.widget-tabs .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.tab;
            document.querySelectorAll('.widget-tabs .tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.widget-tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-content-${targetTab}`);
            });
        });
    });

    // --- 모달 DOM ---
    // 새 과목 추가 모달
    const addSubjectModal = document.getElementById('addSubjectModal');
    const addSubjectForm = document.getElementById('addSubjectForm');
    const addSubjectSemesterIdInput = document.getElementById('addSubjectSemesterId');
    const addNameInput = document.getElementById('addSubjectName');
    const addProfInput = document.getElementById('addSubjectProfessor');
    const addCreditsInput = document.getElementById('addSubjectCredits');
    const addTimeSlotContainer = document.getElementById('addTimeSlotContainer');
    const addMoreTimeSlotBtn = document.getElementById('addMoreTimeSlotBtn');
    const saveNewSubjectBtn = document.getElementById('saveNewSubjectBtn');

    // 과목 수정 모달
    const editSubjectModal = document.getElementById('editSubjectModal');
    const editSubjectIdInput = document.getElementById('editSubjectId');
    const editNameInput = document.getElementById('editSubjectName');
    const editProfInput = document.getElementById('editSubjectProfessor');
    const editCreditsInput = document.getElementById('editSubjectCredits');
    const editGradeInput = document.getElementById('editSubjectGrade');
    const editTimeSlotContainer = document.getElementById('editTimeSlotContainer');
    const editAddTimeSlotBtn = document.getElementById('editAddTimeSlotBtn');
    const editMemoTextInput = document.getElementById('editMemoText');
    const editTodoListUl = document.getElementById('editMemoTodoList');
    const editTodoNewInput = document.getElementById('editMemoNewTodoInput');
    const editTodoAddBtn = document.getElementById('editMemoAddTodoBtn');
    const updateSubjectBtn = document.getElementById('updateSubjectBtn');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');

    // --- 1. 초기화 ---
    async function initializePage() {
        setupEventListeners();

        // 서버에서 학기 목록 로드
        await loadAllSemesters();
        
        // 학기 목록이 있으면, 첫 학기 시간표 로드
        if (allSemesters.length > 0) {
            currentSemesterId = allSemesters[0].id;
            semesterSelect.value = currentSemesterId;
            await loadTimetableForSemester(currentSemesterId);
        } else {
            // 학기가 없는 경우 UI 처리
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">등록된 학기가 없습니다.</td></tr>`;
            addSubjectBtn.disabled = true;
        }

        // GPA 그래프 및 학점 정보 로드
        loadGpaStats();
    }

    // --- 2. 이벤트 리스너 설정 ---
    function setupEventListeners() {
        semesterSelect.addEventListener('change', handleSemesterChange);
        addSubjectBtn.addEventListener('click', openAddSubjectModal);

        // 목표 학점 관련
        editGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'flex'; editGoalBtn.style.display = 'none'; });
        cancelGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block'; });
        saveGoalBtn.addEventListener('click', saveCreditGoal);
        refreshGpaChartBtn.addEventListener('click', loadGpaStats);
        
        // '새 과목 추가' 모달
        addMoreTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, addTimeSlotContainer));
        saveNewSubjectBtn.addEventListener('click', saveNewSubject);
        addSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => addSubjectModal.classList.remove('active')));
        
        // '과목 수정' 모달
        editAddTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, editTimeSlotContainer));
        editTodoAddBtn.addEventListener('click', () => addTodoItemToModal(editTodoNewInput, editTodoListUl));
        editTodoNewInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTodoItemToModal(editTodoNewInput, editTodoListUl); }});
        updateSubjectBtn.addEventListener('click', updateSubject);
        deleteSubjectBtn.addEventListener('click', deleteSubject);
        editSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => editSubjectModal.classList.remove('active')));
    }

    // --- 3. 데이터 로딩 (API) ---
    async function loadAllSemesters() {
        try {
            const response = await fetch('/api/semesters');
            if (!response.ok) throw new Error('학기 목록 로드 실패');
            allSemesters = await response.json();
            populateSemesterDropdown();
        } catch (error) {
            console.error(error);
            semesterSelect.innerHTML = `<option value="">${error.message}</option>`;
        }
    }

    async function handleSemesterChange() {
        const selectedId = parseInt(semesterSelect.value, 10);
        if (selectedId && selectedId !== currentSemesterId) {
            currentSemesterId = selectedId;
            await loadTimetableForSemester(currentSemesterId);
        }
    }

    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableAndTodos();
            return;
        }
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();
            currentSubjects = data.subjects || [];
            renderTimetableGrid(currentSubjects);
            renderTodoSummary(currentSubjects);
        } catch (error) {
            console.error(error);
            clearTimetableAndTodos();
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">${error.message}</td></tr>`;
        }
    }
    
    async function loadGpaStats() {
        if (!gpaChartCanvas) return;
        try {
            const response = await fetch('/api/gpa-stats');
            if (!response.ok) throw new Error(`GPA 통계 로드 실패 (${response.status})`);
            const statsData = await response.json();
            
            updateCreditProgress(statsData.total_earned_credits, parseInt(goalCreditsEl.textContent, 10));
            overallGpaEl.textContent = statsData.overall_gpa;
            
            renderGpaChart(statsData.semesters);
        } catch (error) {
            console.error(error);
            const ctx = gpaChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, gpaChartCanvas.width, gpaChartCanvas.height);
            ctx.fillText(error.message, gpaChartCanvas.width / 2, gpaChartCanvas.height / 2);
        }
    }

    // --- 4. 렌더링 함수 ---
    function populateSemesterDropdown() {
        semesterSelect.innerHTML = '';
        if (allSemesters.length > 0) {
            allSemesters.forEach(s => {
                const option = new Option(s.name, s.id);
                semesterSelect.add(option);
            });
            addSubjectBtn.disabled = false;
        } else {
            semesterSelect.innerHTML = '<option value="">학기 없음</option>';
            addSubjectBtn.disabled = true;
        }
    }

    function renderTimetableGrid(subjects) {
        timetableBody.innerHTML = '';
        const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
        hours.forEach(hour => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${hour}:00</td>` + '<td data-day="1"></td>'.repeat(5);
            timetableBody.appendChild(row);
        });

        requestAnimationFrame(() => {
            const cellHeight = timetableBody.querySelector('td').offsetHeight;
            if (!cellHeight || cellHeight === 0) return;

            subjects.forEach(subject => {
                subject.timeslots.forEach(ts => {
                    const startHour = parseInt(ts.start.split(':')[0]);
                    const startMinute = parseInt(ts.start.split(':')[1]);
                    const endHour = parseInt(ts.end.split(':')[0]);
                    const endMinute = parseInt(ts.end.split(':')[1]);

                    const targetCell = timetableBody.querySelector(`tr:nth-child(${startHour - 8}) td:nth-child(${ts.day + 1})`);
                    if (!targetCell) return;
                    
                    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
                    const topOffset = (startMinute / 60) * cellHeight;
                    const slotHeight = (durationMinutes / 60) * cellHeight;

                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight - 2}px`; // -2 for border
                    slotDiv.innerHTML = `<div class="slot-subject">${subject.name}</div><div class="slot-room">${ts.room || ''}</div>`;
                    slotDiv.addEventListener('click', () => openEditSubjectModal(subject.id));
                    targetCell.appendChild(slotDiv);
                });
            });
        });
    }

    function clearTimetableAndTodos() {
        timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">표시할 시간표가 없습니다.</td></tr>`;
        todoSummaryList.innerHTML = '<p class="todo-summary-empty">학기를 선택해주세요.</p>';
    }

    function renderTodoSummary(subjects) {
        todoSummaryList.innerHTML = '';
        const subjectsWithTodos = subjects.filter(s => s.memo && s.memo.todos && s.memo.todos.length > 0);
        if (subjectsWithTodos.length === 0) {
            todoSummaryList.innerHTML = '<p class="todo-summary-empty">이번 학기 Todo가 없습니다.</p>';
            return;
        }
        subjectsWithTodos.forEach(subject => {
            const pendingTodos = subject.memo.todos.filter(t => !t.done);
            const isCompleted = pendingTodos.length === 0;
            const itemDiv = document.createElement('div');
            itemDiv.className = `todo-summary-item ${isCompleted ? 'completed' : ''}`;
            itemDiv.innerHTML = `
                <div class="todo-subject">${subject.name} (${isCompleted ? '완료' : `${pendingTodos.length}개 남음`})</div>
                <ul class="todo-list">
                    ${subject.memo.todos.map(todo => `<li class="todo-list-item ${todo.done ? 'done' : 'pending'}"><i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}"></i> ${todo.task}</li>`).join('')}
                </ul>`;
            todoSummaryList.appendChild(itemDiv);
        });
    }
    
    function renderGpaChart(semesters) {
        if (gpaChartInstance) gpaChartInstance.destroy();
        gpaChartInstance = new Chart(gpaChartCanvas, {
            type: 'line',
            data: {
                labels: semesters.map(s => s.semester_name.replace('년 ', '.')),
                datasets: [{
                    label: '학기별 평점(GPA)',
                    data: semesters.map(s => s.gpa),
                    backgroundColor: 'rgba(165, 0, 52, 0.1)',
                    borderColor: 'rgba(165, 0, 52, 1)',
                    borderWidth: 2,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 4.5 } },
                plugins: { tooltip: { mode: 'index', intersect: false } }
            }
        });
    }

    // --- 5. 학점 위젯 로직 ---
    function updateCreditProgress(current, goal) {
         const remaining = Math.max(0, goal - current);
         const percentage = (goal > 0) ? Math.min(100, (current / goal) * 100) : 0;
         const circumference = 2 * Math.PI * 45;
         const dashoffset = circumference - (circumference * percentage / 100);
         currentCreditsEl.textContent = current;
         goalCreditsEl.textContent = goal;
         remainingCreditsEl.textContent = remaining;
         creditPercentageEl.textContent = `${Math.round(percentage)}%`;
         if (creditProgressCircle) creditProgressCircle.style.strokeDashoffset = dashoffset;
    }

    async function saveCreditGoal() {
        const newGoal = parseInt(newGoalInput.value, 10);
        if (isNaN(newGoal) || newGoal <= 0) { alert('유효한 학점을 입력하세요.'); return; }
        saveGoalBtn.disabled = true;
        try {
            const response = await fetch('/api/credits/goal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: newGoal }) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            updateCreditProgress(parseInt(currentCreditsEl.textContent, 10), result.new_goal);
            editGoalForm.style.display = 'none';
            editGoalBtn.style.display = 'inline-block';
        } catch (error) {
            alert(`목표 학점 저장 실패: ${error.message}`);
        } finally {
            saveGoalBtn.disabled = false;
        }
    }

    // --- 6. 모달 로직 (추가/수정 분리) ---
    function openAddSubjectModal() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 선택해주세요."); return; }
        addSubjectForm.reset();
        addSubjectSemesterIdInput.value = currentSemesterId;
        addTimeSlotContainer.innerHTML = '';
        createTimeSlotEntry(null, addTimeSlotContainer); // 기본 시간 슬롯 1개 추가
        addSubjectModal.classList.add('active');
    }

    function openEditSubjectModal(subjectId) {
        const subject = currentSubjects.find(s => s.id === subjectId);
        if (!subject) return;
        editSubjectIdInput.value = subject.id;
        editNameInput.value = subject.name;
        editProfInput.value = subject.professor;
        editCreditsInput.value = subject.credits;
        editGradeInput.value = subject.grade || "Not Set";
        editTimeSlotContainer.innerHTML = '';
        if (subject.timeslots.length > 0) {
            subject.timeslots.forEach(ts => createTimeSlotEntry(ts, editTimeSlotContainer));
        } else {
            createTimeSlotEntry(null, editTimeSlotContainer);
        }
        const memo = subject.memo || { note: '', todos: [] };
        editMemoTextInput.value = memo.note || '';
        renderTodoListInModal(memo.todos || [], editTodoListUl);
        editSubjectModal.classList.add('active');
    }

    function createTimeSlotEntry(timeslot, container) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        entryDiv.innerHTML = `
            <select name="day">
                <option value="1">월</option><option value="2">화</option><option value="3">수</option>
                <option value="4">목</option><option value="5">금</option>
            </select>
            <input type="time" name="start_time" value="${timeslot ? timeslot.start : '09:00'}">
            <input type="time" name="end_time" value="${timeslot ? timeslot.end : '10:15'}">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}">
            <button type="button" class="timeslot-delete-btn">&times;</button>
        `;
        if (timeslot) entryDiv.querySelector('select[name="day"]').value = timeslot.day;
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        container.appendChild(entryDiv);
    }
    
    function renderTodoListInModal(todos, ulElement) {
        ulElement.innerHTML = '';
        if (!todos || todos.length === 0) {
            ulElement.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
            return;
        }
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.done ? 'done' : ''}`;
            const todoId = `modal-todo-${index}-${Date.now()}`;
            li.innerHTML = `
                <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
                <label for="${todoId}" class="todo-label">${todo.task}</label>
                <span class="todo-delete-btn">&times;</span>
            `;
            li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => li.classList.toggle('done', e.target.checked));
            li.querySelector('.todo-delete-btn').addEventListener('click', () => {
                li.remove();
                if (ulElement.children.length === 0) {
                    ulElement.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
                }
            });
            ulElement.appendChild(li);
        });
    }

    function addTodoItemToModal(inputElement, ulElement) {
        const taskText = inputElement.value.trim();
        if (taskText === '') return;
        const emptyMsg = ulElement.querySelector('.todo-empty');
        if (emptyMsg) ulElement.innerHTML = '';
        
        renderTodoListInModal([...getTodosFromModal(ulElement), { task: taskText, done: false }], ulElement);
        
        inputElement.value = '';
        inputElement.focus();
    }
    
    function getTodosFromModal(ulElement) {
        const todos = [];
        ulElement.querySelectorAll('.todo-item').forEach(li => {
            todos.push({
                task: li.querySelector('.todo-label').textContent,
                done: li.querySelector('input[type="checkbox"]').checked
            });
        });
        return todos;
    }

    // --- 7. 데이터 저장/수정/삭제 API 호출 ---
    async function saveNewSubject() {
        const data = {
            semester_id: parseInt(addSubjectSemesterIdInput.value, 10),
            name: addNameInput.value.trim(),
            professor: addProfInput.value.trim(),
            credits: parseInt(addCreditsInput.value, 10) || 0,
            timeslots: Array.from(addTimeSlotContainer.querySelectorAll('.timeslot-entry')).map(entry => ({
                day: parseInt(entry.querySelector('[name="day"]').value, 10),
                start: entry.querySelector('[name="start_time"]').value,
                end: entry.querySelector('[name="end_time"]').value,
                room: entry.querySelector('[name="room"]').value.trim()
            })).filter(ts => ts.day && ts.start && ts.end)
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }
        
        saveNewSubjectBtn.disabled = true;
        try {
            const response = await fetch('/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            addSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId);
            await loadGpaStats(); // 학점 정보도 갱신될 수 있으므로 호출
        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveNewSubjectBtn.disabled = false;
        }
    }
    
    async function updateSubject() {
        const subjectId = editSubjectIdInput.value;
        const data = {
            name: editNameInput.value.trim(),
            professor: editProfInput.value.trim(),
            credits: parseInt(editCreditsInput.value, 10) || 0,
            grade: editGradeInput.value,
            timeslots: Array.from(editTimeSlotContainer.querySelectorAll('.timeslot-entry')).map(entry => ({
                day: parseInt(entry.querySelector('[name="day"]').value, 10),
                start: entry.querySelector('[name="start_time"]').value,
                end: entry.querySelector('[name="end_time"]').value,
                room: entry.querySelector('[name="room"]').value.trim()
            })).filter(ts => ts.day && ts.start && ts.end),
            memo: {
                note: editMemoTextInput.value.trim(),
                todos: getTodosFromModal(editTodoListUl)
            }
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        updateSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId);
            await loadGpaStats();
        } catch (error) {
            alert(`수정 실패: ${error.message}`);
        } finally {
            updateSubjectBtn.disabled = false;
        }
    }

    async function deleteSubject() {
        const subjectId = editSubjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까?')) return;

        deleteSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');
            await loadTimetableForSemester(currentSemesterId);
            await loadGpaStats();
        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteSubjectBtn.disabled = false;
        }
    }

    initializePage();
});
