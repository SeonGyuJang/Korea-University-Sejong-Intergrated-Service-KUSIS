// static/js/timetable_management.js
document.addEventListener('DOMContentLoaded', () => {

    // --- 전역 변수 ---
    let currentSemesterId = null;
    let currentSemesterInfo = null;
    let allSemesters = [];
    let currentSubjects = []; // 현재 학기 과목 목록 (과목명 포함)
    let gpaChartInstance = null;
    // selectedSubjectForDetails 제거됨 (주차별 모아보기는 학기 전체 대상)

    let currentDailyMemoData = { note: "" }; // Req 1: 일일 메모 데이터
    const todayDateStr = new Date().toISOString().split('T')[0]; // Req 1: 오늘 날짜 YYYY-MM-DD

    // Global Todo 위젯 관련 변수 (좌측 사이드바)
    let currentGlobalTodos = [];
    let selectedTodoDay = new Date().getDay(); // 0:일, 1:월, ...
    const globalTodoWidget = document.getElementById('globalTodoWidget');
    const globalTodoList = document.getElementById('globalTodoList');
    const globalNewTodoInput = document.getElementById('globalNewTodoInput');
    const globalAddTodoBtn = document.getElementById('globalAddTodoBtn');
    const globalTagSuggestionOverlay = document.getElementById('globalTagSuggestionOverlay');
    const globalTodoWeekRangeEl = document.getElementById('globalTodoWeekRange');
    let currentWeekStartDate = null;

    // 과목별 색상 팔레트
    const subjectColors = [
        'rgba(239, 83, 80, 0.1)',   // Red
        'rgba(236, 64, 122, 0.1)',  // Pink
        'rgba(171, 71, 188, 0.1)',  // Purple
        'rgba(126, 87, 194, 0.1)',  // Deep Purple
        'rgba(92, 107, 192, 0.1)',  // Indigo
        'rgba(66, 165, 245, 0.1)',  // Blue
        'rgba(41, 182, 246, 0.1)',  // Light Blue
        'rgba(38, 198, 218, 0.1)',  // Cyan
        'rgba(38, 166, 154, 0.1)',  // Teal
        'rgba(102, 187, 106, 0.1)', // Green
        'rgba(255, 167, 38, 0.1)', // Orange
        'rgba(141, 110, 99, 0.1)'   // Brown
    ];
    let subjectColorMap = {};

    // --- DOM 요소 캐싱 ---
    const semesterSelect = document.getElementById('semesterSelect');
    const timetableBody = document.getElementById('timetableEditorBody');
    const addSubjectBtn = document.getElementById('addSubjectBtn');

    // 왼쪽 사이드 위젯 DOM
    const creditProgressCircle = document.getElementById('creditProgress');
    const creditPercentageEl = document.getElementById('creditPercentage');
    const currentCreditsEl = document.getElementById('currentCredits'); // 총 이수 학점
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
    // const currentSemesterCreditsEl = document.getElementById('currentSemesterCredits'); // Req 1: 제거됨

    // 오른쪽 과목 상세 정보 사이드바 DOM
    const subjectDetailsListUl = document.getElementById('subjectDetailsList');
    const dailyMemoTitle = document.getElementById('dailyMemoTitle'); // Req 1
    const viewAllMemosBtn = document.getElementById('viewAllMemosBtn'); // Req 3
    const dailyMemoSubjectName = document.getElementById('dailyMemoSubjectName'); // Req 1
    const currentMemoDateEl = document.getElementById('currentMemoDate'); // Req 1
    const dailyMemoText = document.getElementById('dailyMemoText'); // Req 1
    const saveDailyMemoBtn = document.getElementById('saveDailyMemoBtn'); // Req 1
    let selectedSubjectForDailyMemo = null; // 일일 메모용으로 선택된 과목

    // 과목 투두 관련 DOM (홈 화면과 연동)
    const subjectTodoName = document.getElementById('subjectTodoName');
    const subjectTodoInput = document.getElementById('subjectTodoInput');
    const addSubjectTodoBtn = document.getElementById('addSubjectTodoBtn');
    const subjectTodoList = document.getElementById('subjectTodoList');
    let currentSubjectTodos = []; // 현재 과목의 투두 목록

    // 탭 DOM (좌측 위젯용)
    document.querySelectorAll('.timetable-side-content .widget-tabs .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.tab;
            const parentWidget = e.currentTarget.closest('.widget');
            if (!parentWidget) return;

            parentWidget.querySelectorAll('.widget-tabs .tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');

            parentWidget.querySelectorAll('.widget-tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-content-${targetTab}`);
            });
        });
    });

    // --- 모달 DOM ---
    const addSubjectModal = document.getElementById('addSubjectModal');
    const addSubjectForm = document.getElementById('addSubjectForm');
    const addSubjectSemesterIdInput = document.getElementById('addSubjectSemesterId');
    const addNameInput = document.getElementById('addSubjectName');
    const addProfInput = document.getElementById('addSubjectProfessor');
    const addCreditsInput = document.getElementById('addSubjectCredits');
    const addTimeSlotContainer = document.getElementById('addTimeSlotContainer');
    const addMoreTimeSlotBtn = document.getElementById('addMoreTimeSlotBtn');
    const saveNewSubjectBtn = document.getElementById('saveNewSubjectBtn');

    const editSubjectModal = document.getElementById('editSubjectModal');
    const editSubjectIdInput = document.getElementById('editSubjectId');
    const editNameInput = document.getElementById('editSubjectName');
    const editProfInput = document.getElementById('editSubjectProfessor');
    const editCreditsInput = document.getElementById('editSubjectCredits');
    const editGradeInput = document.getElementById('editSubjectGrade');
    const editTimeSlotContainer = document.getElementById('editTimeSlotContainer');
    const editAddTimeSlotBtn = document.getElementById('editAddTimeSlotBtn');
    const updateSubjectBtn = document.getElementById('updateSubjectBtn');
    const deleteSubjectBtn = document.getElementById('deleteSubjectBtn');

    const allMemosModal = document.getElementById('allMemosModal'); // Req 3

    // --- 1. 초기화 ---
    async function initializePage() {
        setupEventListeners();
        await loadAllSemesters(); // 모든 학기 목록 로드 및 드롭다운 채우기

        // 페이지 로드 시 학기 ID 없이 API 호출하여 기본(현재 날짜 기준) 학기 로드
        try {
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">기본 시간표 로딩 중...</td></tr>`;
            const response = await fetch('/api/timetable-data'); // semester_id 없이 호출
            if (!response.ok) throw new Error(`기본 시간표 로드 실패 (${response.status})`);
            const data = await response.json();

            if (data.semester && data.semester.id) {
                currentSemesterId = data.semester.id;
                currentSemesterInfo = data.semester;
                currentSubjects = data.subjects || [];

                // 드롭다운에서 해당 학기 선택
                if (semesterSelect) semesterSelect.value = currentSemesterId;

                // UI 렌더링
                renderTimetableGrid(currentSubjects);
                renderSubjectDetailsList(currentSubjects);
                resetDailyMemoPanel(); // 초기에는 일일 메모 리셋
                addSubjectBtn.disabled = false; // 새 과목 추가 버튼 활성화

                // Global Todo 로드 (좌측 사이드바 위젯)
                await loadAndRenderGlobalTodos(new Date());

                // 학점 통계 로드
                await loadGpaStats();
                // Req 1: '현재 학기 학점' 업데이트 로직 제거

            } else if (allSemesters.length > 0) {
                 // 기본 학기 로드 실패했지만, 다른 학기 목록이 있다면 최신 학기 로드 시도 (Fallback)
                 console.warn("기본 학기 로드 실패 또는 학기 정보 없음. 최신 학기로 대체합니다.");
                 currentSemesterId = allSemesters[0].id; // 가장 첫 번째 (최신) 학기 ID
                 if (semesterSelect) semesterSelect.value = currentSemesterId;
                 await loadTimetableForSemester(currentSemesterId); // 해당 학기 시간표 로드

            } else {
                 // 학기 목록 자체가 없을 경우
                 throw new Error("등록된 학기가 없습니다.");
            }

        } catch (error) {
            // 초기 로드 실패 시 UI 처리
            console.error("초기 시간표 로드 실패:", error);
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">${error.message}</td></tr>`;
            if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = `<li class="subject-details-empty">${error.message}</li>`;
            if(globalTodoList) globalTodoList.innerHTML = `<li class="todo-empty">${error.message}</li>`;
            addSubjectBtn.disabled = true;
            resetDailyMemoPanel();
            // Req 1: '현재 학기 학점' 관련 로직 없음
        }

        // GPA 통계 로드 (총 이수 학점 계산 포함) - 학기 로드 후 실행
        loadGpaStats();
    }


    // --- 2. 이벤트 리스너 설정 ---
    function setupEventListeners() {
        if (semesterSelect) semesterSelect.addEventListener('change', handleSemesterChange);
        if (addSubjectBtn) addSubjectBtn.addEventListener('click', openAddSubjectModal);

        if (editGoalBtn) editGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'flex'; editGoalBtn.style.display = 'none'; });
        if (cancelGoalBtn) cancelGoalBtn.addEventListener('click', () => { editGoalForm.style.display = 'none'; editGoalBtn.style.display = 'inline-block'; });
        if (saveGoalBtn) saveGoalBtn.addEventListener('click', saveCreditGoal);
        if (refreshGpaChartBtn) refreshGpaChartBtn.addEventListener('click', loadGpaStats);

        if (addMoreTimeSlotBtn) addMoreTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, addTimeSlotContainer));
        if (saveNewSubjectBtn) saveNewSubjectBtn.addEventListener('click', saveNewSubject);
        if (addSubjectModal) addSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => addSubjectModal.classList.remove('active')));

        if (editAddTimeSlotBtn) editAddTimeSlotBtn.addEventListener('click', () => createTimeSlotEntry(null, editTimeSlotContainer));
        if (updateSubjectBtn) updateSubjectBtn.addEventListener('click', updateSubject);
        if (deleteSubjectBtn) deleteSubjectBtn.addEventListener('click', deleteSubject);
        if (editSubjectModal) editSubjectModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => editSubjectModal.classList.remove('active')));

        // 일일 메모 위젯 이벤트 리스너 (Req 1)
        if (saveDailyMemoBtn) saveDailyMemoBtn.addEventListener('click', saveDailyMemo);
        // *** 수정: viewAllMemosBtn 클릭 시 openAllMemosModal(currentSemesterId) 호출 ***
        if (viewAllMemosBtn) viewAllMemosBtn.addEventListener('click', () => openAllMemosModal(currentSemesterId));

        // 과목 투두 이벤트 리스너
        if (addSubjectTodoBtn) addSubjectTodoBtn.addEventListener('click', addSubjectTodo);
        if (subjectTodoInput) {
            subjectTodoInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubjectTodo();
                }
            });
        }

        // 주차별 모아보기 모달 (Req 3)
        if (allMemosModal) allMemosModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => allMemosModal.classList.remove('active')));

        // Global Todo 위젯 (좌측 사이드바) 이벤트 리스너
        if (globalTodoWidget) {
            globalTodoWidget.querySelectorAll('.global-day-selector .day-circle').forEach(button => {
                button.addEventListener('click', (e) => {
                    selectedTodoDay = parseInt(e.currentTarget.dataset.day, 10);
                    updateTodoDaySelection(selectedTodoDay);
                    renderGlobalTodoList(); // 선택된 요일 기준으로 리스트 다시 렌더링
                });
            });

            if (globalNewTodoInput) {
                globalNewTodoInput.addEventListener('input', handleGlobalTodoInputTagging); // @태그
                globalNewTodoInput.addEventListener('keypress', (e) => {
                     if (e.key === 'Enter') {
                        e.preventDefault();
                        const firstSuggestion = globalTagSuggestionOverlay?.querySelector('.suggestion-item');
                        if (globalTagSuggestionOverlay?.style.display === 'block' && firstSuggestion) {
                            selectGlobalTagSuggestion(firstSuggestion.textContent);
                        } else {
                            addGlobalTodo(); // Todo 추가
                        }
                     }
                });
                globalNewTodoInput.addEventListener('blur', () => {
                    setTimeout(() => {
                        if (globalTagSuggestionOverlay) globalTagSuggestionOverlay.style.display = 'none';
                    }, 150);
                });
            }
            if (globalAddTodoBtn) globalAddTodoBtn.addEventListener('click', addGlobalTodo);
        }

        // 과목 선택 리스너 (이벤트 위임 사용) - 일일 메모 로드
        if (subjectDetailsListUl) {
             subjectDetailsListUl.addEventListener('click', (e) => {
                const li = e.target.closest('.subject-details-item');
                if (li && li.dataset.subjectId) {
                    if (!e.target.closest('.grade-select') && !e.target.closest('.btn-edit-subject')) {
                        if (subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                        li.classList.add('selected');
                        // *** 수정: selectSubjectForDailyMemo 호출 ***
                        selectSubjectForDailyMemo(parseInt(li.dataset.subjectId, 10)); // 일일 메모 로드 트리거
                    }
                }
            });
            // 등급 변경 이벤트 (이벤트 위임)
             subjectDetailsListUl.addEventListener('change', (e) => {
                 if (e.target.classList.contains('grade-select')) {
                     handleGradeChange(e);
                 }
            });
            // 수정 버튼 이벤트 (이벤트 위임)
            subjectDetailsListUl.addEventListener('click', (e) => {
                 const editBtn = e.target.closest('.btn-edit-subject');
                 if (editBtn && editBtn.dataset.subjectId) {
                     e.stopPropagation();
                     openEditSubjectModal(parseInt(editBtn.dataset.subjectId, 10));
                 }
            });
        }

        // 시간표 슬롯 클릭 리스너 (과목 선택) - 일일 메모 로드
        if (timetableBody) {
            timetableBody.addEventListener('click', (e) => {
                const slot = e.target.closest('.subject-slot');
                if (slot && slot.dataset.subjectId) {
                    e.stopPropagation();
                    const subjectId = parseInt(slot.dataset.subjectId, 10);
                    if (subjectDetailsListUl) {
                        subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
                        const selectedLi = subjectDetailsListUl.querySelector(`li[data-subject-id="${subjectId}"]`);
                        if(selectedLi) selectedLi.classList.add('selected');
                    }
                    // *** 수정: selectSubjectForDailyMemo 호출 ***
                    selectSubjectForDailyMemo(subjectId); // 일일 메모 로드 트리거
                }
            });
        }
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
            if (semesterSelect) semesterSelect.innerHTML = `<option value="">${error.message}</option>`;
        }
    }

    async function handleSemesterChange() {
        if (!semesterSelect) return;
        const selectedId = parseInt(semesterSelect.value, 10);
        if (selectedId && selectedId !== currentSemesterId) {
            currentSemesterId = selectedId;
            await loadTimetableForSemester(currentSemesterId);
            // *** 수정: selectedSubjectForDetails 대신 selectedSubjectForDailyMemo 사용 ***
            selectedSubjectForDailyMemo = null;
            resetDailyMemoPanel(); // Req 1: 일일 메모 패널 초기화
        }
    }

    async function loadTimetableForSemester(semesterId) {
        if (!semesterId) {
            clearTimetableAndTodos();
            resetSubjectDetailsPanel();
            resetDailyMemoPanel(); // Req 1
            disableGlobalTodoWidget("학기를 선택하세요.");
            currentSemesterInfo = null;
            currentSubjects = []; // 과목 목록 초기화
            if (addSubjectBtn) addSubjectBtn.disabled = true;
            // Req 1: '현재 학기 학점' 관련 로직 없음
            return;
        }
        if (timetableBody) timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">시간표 로딩 중...</td></tr>`;
        if (subjectDetailsListUl) subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">과목 목록 로딩 중...</li>';
        disableGlobalTodoWidget("학기 로딩 중...");

        try {
            const response = await fetch(`/api/timetable-data?semester_id=${semesterId}`);
            if (!response.ok) throw new Error(`시간표 로드 실패 (${response.status})`);
            const data = await response.json();

            currentSemesterInfo = data.semester;
            currentSubjects = data.subjects || []; // 과목 목록 업데이트

            renderTimetableGrid(currentSubjects);
            renderSubjectDetailsList(currentSubjects);
            resetDailyMemoPanel(); // Req 1
            if (addSubjectBtn) addSubjectBtn.disabled = false;

            // Global Todo 로드
            await loadAndRenderGlobalTodos(new Date());

            // 학점 통계 로드
            await loadGpaStats();
            // Req 1: '현재 학기 학점' 관련 로직 없음

        } catch (error) {
            console.error(error);
            clearTimetableAndTodos();
            resetSubjectDetailsPanel(error.message);
            resetDailyMemoPanel(); // Req 1
            disableGlobalTodoWidget(error.message);
            currentSemesterInfo = null;
            currentSubjects = []; // 에러 시 과목 목록 초기화
            if (addSubjectBtn) addSubjectBtn.disabled = true;
            // Req 1: '현재 학기 학점' 관련 로직 없음
        }
    }

    async function loadGpaStats() {
        if (!gpaChartCanvas || !creditProgressCircle || !overallGpaEl) return;
        try {
            const response = await fetch('/api/gpa-stats');
            if (!response.ok) throw new Error(`GPA 통계 로드 실패 (${response.status})`);
            const statsData = await response.json();

            const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;
            // --- 수정 (Req 1) ---
            // API가 계산한 'total_earned_credits' (총 이수 학점)을 사용
            const totalCredits = statsData.total_earned_credits || 0;
            // --- 수정 끝 ---

            updateCreditProgress(totalCredits, currentGoal);
            if (overallGpaEl) overallGpaEl.textContent = statsData.overall_gpa;

            renderGpaChart(statsData.semesters);
        } catch (error) {
            console.error(error);
            const ctx = gpaChartCanvas ? gpaChartCanvas.getContext('2d') : null;
            if (ctx) {
                ctx.clearRect(0, 0, gpaChartCanvas.width, gpaChartCanvas.height);
                ctx.textAlign = 'center';
                ctx.fillText(error.message, gpaChartCanvas.width / 2, gpaChartCanvas.height / 2);
            }
             updateCreditProgress(0, goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130);
             if (overallGpaEl) overallGpaEl.textContent = 'N/A';
        }
    }

    // --- 4. 렌더링 함수 ---
    function populateSemesterDropdown() {
        if (!semesterSelect) return;
        semesterSelect.innerHTML = '';
        if (allSemesters.length > 0) {
            allSemesters.forEach(s => {
                const option = new Option(s.name, s.id);
                semesterSelect.add(option);
            });
        } else {
            semesterSelect.innerHTML = '<option value="">학기 없음</option>';
            if (addSubjectBtn) addSubjectBtn.disabled = true;
        }
    }

    // 시간표 그리드 렌더링
    function renderTimetableGrid(subjects) {
        if (!timetableBody) return;
        timetableBody.innerHTML = '';
        subjectColorMap = {}; // 색상 맵 초기화

        let minHour = 9;
        let maxHour = 18;

        // 시간 범위 계산 및 색상 매핑
        if (subjects && subjects.length > 0) {
            let earliestStartHour = 24, latestEndHour = -1;
            subjects.forEach((subject, index) => {
                // Req 4: 과목 ID와 색상 매핑
                if (!subjectColorMap[subject.id]) {
                    subjectColorMap[subject.id] = subjectColors[index % subjectColors.length];
                }
                subject.timeslots.forEach(ts => {
                    if (ts.start && ts.end) {
                        const startH = parseInt(ts.start.split(':')[0]);
                        const endH = parseInt(ts.end.split(':')[0]);
                        const endM = parseInt(ts.end.split(':')[1]);
                        earliestStartHour = Math.min(earliestStartHour, startH);
                        latestEndHour = Math.max(latestEndHour, (endM > 0 ? endH : endH - 1));
                    }
                });
            });
            if (earliestStartHour < 24) minHour = Math.min(minHour, earliestStartHour);
            if (latestEndHour >= 0) maxHour = Math.max(maxHour, latestEndHour + 1);
            else if (earliestStartHour < 24) maxHour = Math.max(maxHour, earliestStartHour + 1);
        }

        // 시간표 행 생성
        for (let h = minHour; h <= maxHour; h++) {
            const hourStr = String(h).padStart(2, '0');
            const row = document.createElement('tr');
            row.setAttribute('data-hour', hourStr);
            row.innerHTML = `<td>${hourStr}:00</td><td data-day="1"></td><td data-day="2"></td><td data-day="3"></td><td data-day="4"></td><td data-day="5"></td>`;
            timetableBody.appendChild(row);
        }

        // 슬롯 배치 또는 빈 메시지 표시
        if (subjects.length > 0) {
            positionTimetableSlots(subjects);
        } else {
            timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">이번 학기에 등록된 과목이 없습니다.</td></tr>`;
        }
    }

    // 시간표 슬롯 배치
    function positionTimetableSlots(subjects) {
         if (!timetableBody) return;
        requestAnimationFrame(() => {
            const firstRowCell = timetableBody.querySelector('td[data-day="1"]');
            if (!firstRowCell) { return; }
            const cellHeight = firstRowCell.offsetHeight;
            if (!cellHeight || cellHeight <= 0) {
                console.warn("Cell height is 0, retrying slot positioning...");
                setTimeout(() => positionTimetableSlots(subjects), 100);
                return;
            }

            subjects.forEach(subject => {
                const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.1)';
                const borderColor = subjectColor.replace('0.1', '0.8');

                subject.timeslots.forEach(ts => {
                     if (!ts.start || !ts.end || !ts.start.includes(':') || !ts.end.includes(':')) {
                         console.warn(`Invalid timeslot data for subject ${subject.name}:`, ts);
                         return;
                     }

                    const [startH, startM] = ts.start.split(':').map(Number);
                    const [endH, endM] = ts.end.split(':').map(Number);
                    const targetCell = timetableBody.querySelector(`tr[data-hour="${String(startH).padStart(2, '0')}"] td[data-day="${ts.day}"]`);
                    if (!targetCell) { return; }

                    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                    if (durationMinutes <= 0) return;

                    const topOffset = (startM / 60) * cellHeight;
                    const slotHeight = Math.max(10, (durationMinutes / 60) * cellHeight - 2);

                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'subject-slot';
                    slotDiv.style.top = `${topOffset}px`;
                    slotDiv.style.height = `${slotHeight}px`;
                    slotDiv.style.backgroundColor = subjectColor; // Req 4
                    slotDiv.style.borderLeft = `4px solid ${borderColor}`; // Req 4
                    slotDiv.dataset.subjectId = subject.id;

                    let innerHTML = `<div class="slot-subject">${subject.name}</div>`;
                    if (slotHeight > 30) innerHTML += `<div class="slot-room">${ts.room || ''}</div>`;
                    slotDiv.innerHTML = innerHTML;

                    targetCell.appendChild(slotDiv);
                });
            });
        });
    }

    function clearTimetableAndTodos() {
        if (timetableBody) timetableBody.innerHTML = `<tr><td colspan="6" class="todo-summary-empty">표시할 시간표가 없습니다.</td></tr>`;
        if (globalTodoList) globalTodoList.innerHTML = '<li class="todo-empty">학기를 선택하세요.</li>';
    }

    // GPA 차트 렌더링
    function renderGpaChart(semesters) {
        if (!gpaChartCanvas) return;
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

    // 과목 목록 렌더링 (오른쪽 사이드바)
    function renderSubjectDetailsList(subjects) {
        if (!subjectDetailsListUl) return;
        subjectDetailsListUl.innerHTML = '';
        if (!subjects || subjects.length === 0) {
            subjectDetailsListUl.innerHTML = '<li class="subject-details-empty">이 학기에 등록된 과목이 없습니다.</li>';
            return;
        }
        subjects.forEach(subject => {
            const li = document.createElement('li');
            li.className = 'subject-details-item';
            li.setAttribute('data-subject-id', subject.id);
            li.innerHTML = `
                <div class="subject-info">
                    <span class="subject-name">${subject.name}</span>
                    <span class="subject-prof">${subject.professor || ''} (${subject.credits}학점)</span>
                </div>
                <div class="subject-grade">
                    <select class="grade-select" data-subject-id="${subject.id}" title="등급 설정">
                        <option value="Not Set" ${!subject.grade || subject.grade === 'Not Set' ? 'selected' : ''}>미설정</option>
                        <option value="A+" ${subject.grade === 'A+' ? 'selected' : ''}>A+</option>
                        <option value="A0" ${subject.grade === 'A0' ? 'selected' : ''}>A0</option>
                        <option value="B+" ${subject.grade === 'B+' ? 'selected' : ''}>B+</option>
                        <option value="B0" ${subject.grade === 'B0' ? 'selected' : ''}>B0</option>
                        <option value="C+" ${subject.grade === 'C+' ? 'selected' : ''}>C+</option>
                        <option value="C0" ${subject.grade === 'C0' ? 'selected' : ''}>C0</option>
                        <option value="D+" ${subject.grade === 'D+' ? 'selected' : ''}>D+</option>
                        <option value="D0" ${subject.grade === 'D0' ? 'selected' : ''}>D0</option>
                        <option value="F" ${subject.grade === 'F' ? 'selected' : ''}>F</option>
                        <option value="P" ${subject.grade === 'P' ? 'selected' : ''}>Pass</option>
                    </select>
                </div>
                <button class="btn-edit-subject" data-subject-id="${subject.id}" title="과목 수정"><i class="fas fa-edit"></i></button>
            `;
            subjectDetailsListUl.appendChild(li);
        });
    }

     // *** 수정: 함수명 변경 및 로직 분리 ***
     // 과목 선택 시 처리 (일일 메모 패널 업데이트)
     function selectSubjectForDailyMemo(subjectId) {
         selectedSubjectForDailyMemo = currentSubjects.find(s => s.id === subjectId);
         if (selectedSubjectForDailyMemo) {
             if(dailyMemoTitle) dailyMemoTitle.innerHTML = `<i class="fas fa-pencil-alt"></i> 오늘 메모 (${selectedSubjectForDailyMemo.name})`;
             if(dailyMemoSubjectName) dailyMemoSubjectName.textContent = selectedSubjectForDailyMemo.name;
             if(subjectTodoName) subjectTodoName.textContent = selectedSubjectForDailyMemo.name;
             loadDailyMemo(); // 오늘 날짜 메모 로드
             enableDailyMemoPanel();
         } else {
             resetDailyMemoPanel();
         }
     }

     // 등급 변경 처리
     async function handleGradeChange(event) {
         const selectElement = event.target;
         const subjectId = parseInt(selectElement.dataset.subjectId, 10);
         const newGrade = selectElement.value;
         const subject = currentSubjects.find(s => s.id === subjectId);
         if (!subject) return;

         subject.grade = newGrade; // 로컬 데이터 즉시 업데이트

         try {
             const timeslotsData = subject.timeslots.map(ts => ({
                day: ts.day, start: ts.start, end: ts.end, room: ts.room
             }));
             const response = await fetch(`/api/subjects/${subjectId}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                    name: subject.name, professor: subject.professor, credits: subject.credits,
                    grade: newGrade, timeslots: timeslotsData
                 })
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message);

             // --- 수정 (Req 1) ---
             // '총 이수 학점' 업데이트
             if (currentCreditsEl && result.total_earned_credits !== undefined) {
                const newTotalCredits = result.total_earned_credits;
                const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;
                updateCreditProgress(newTotalCredits, currentGoal);
             }
             // --- 수정 끝 ---

             loadGpaStats(); // 서버 업데이트 성공 후, 전체 GPA 통계 다시 로드

         } catch (error) {
             alert(`등급 업데이트 실패: ${error.message}`);
             // 실패 시 로컬 데이터 롤백 (선택 사항)
             // const originalSubject = await fetch(`/api/subjects/${subjectId}`).then(res => res.json());
             // if (originalSubject.status === 'success') {
             //     subject.grade = originalSubject.subject.grade;
             //     selectElement.value = subject.grade;
             // }
         }
     }

     // 일일 메모 데이터 로드 (API 호출) - Req 1
     async function loadDailyMemo() {
         if (!selectedSubjectForDailyMemo || !dailyMemoText) return;
         dailyMemoText.disabled = true;
         dailyMemoText.value = '메모 로딩 중...';
         disableDailyMemoPanel();

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDailyMemo.id}/memo/${todayDateStr}`);
             if (!response.ok) throw new Error('메모 로드 실패');
             const memoData = await response.json();
             if (memoData.status === 'success') {
                currentDailyMemoData = {
                    note: memoData.note || '',
                    subject_note: memoData.subject_note || ''
                };
                currentSubjectTodos = memoData.todos || [];
                dailyMemoText.value = currentDailyMemoData.note;
                if (currentMemoDateEl) currentMemoDateEl.textContent = `${todayDateStr} (${new Date().toLocaleDateString('ko-KR', { weekday: 'long' })})`;

                // 투두 목록 렌더링
                renderSubjectTodos();

                enableDailyMemoPanel();
             } else {
                throw new Error(memoData.message || '데이터 로드 실패');
             }
         } catch (error) {
             console.error(`Error loading memo for ${todayDateStr}:`, error);
             if (currentMemoDateEl) currentMemoDateEl.textContent = `${todayDateStr} (로드 실패)`;
             dailyMemoText.value = '메모 로드에 실패했습니다.';
             currentSubjectTodos = [];
             renderSubjectTodos();
             disableDailyMemoPanel();
         }
     }

     // 일일 메모 저장 (API 호출) - Req 1
     async function saveDailyMemo() {
         if (!selectedSubjectForDailyMemo || !dailyMemoText) {
             alert("과목을 먼저 선택해주세요.");
             return;
         }
         currentDailyMemoData.note = dailyMemoText.value.trim();
         if (saveDailyMemoBtn) {
            saveDailyMemoBtn.disabled = true;
            saveDailyMemoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
         }

         try {
             const response = await fetch(`/api/subjects/${selectedSubjectForDailyMemo.id}/memo/${todayDateStr}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     note: currentDailyMemoData.note,
                     todos: currentSubjectTodos,  // 투두 목록 포함
                     subject_note: currentDailyMemoData.subject_note
                 })
             });
             const result = await response.json();
             if (result.status !== 'success') throw new Error(result.message || '저장 실패');

             if (saveDailyMemoBtn) {
                saveDailyMemoBtn.innerHTML = '<i class="fas fa-check"></i> 저장 완료!';
                setTimeout(() => {
                     if (saveDailyMemoBtn) {
                        saveDailyMemoBtn.disabled = false;
                        saveDailyMemoBtn.innerHTML = '<i class="fas fa-save"></i> 메모 저장';
                     }
                }, 2000);
             }
         } catch (error) {
             console.error("Failed to save daily memo:", error);
             alert(`메모 저장 실패: ${error.message}`);
             if (saveDailyMemoBtn) {
                saveDailyMemoBtn.disabled = false;
                saveDailyMemoBtn.innerHTML = '<i class="fas fa-times"></i> 저장 실패';
             }
         }
     }

     // 과목 투두 렌더링
     function renderSubjectTodos() {
         if (!subjectTodoList) return;
         subjectTodoList.innerHTML = '';

         if (currentSubjectTodos.length === 0) {
             subjectTodoList.innerHTML = '<li style="color: var(--text-secondary); text-align: center; padding: 20px;">투두가 없습니다.</li>';
             return;
         }

         currentSubjectTodos.forEach((todo, index) => {
             const li = document.createElement('li');
             li.style.display = 'flex';
             li.style.alignItems = 'center';
             li.style.gap = '8px';
             li.style.padding = '8px';
             li.style.borderBottom = '1px solid var(--border-color)';

             const checkbox = document.createElement('input');
             checkbox.type = 'checkbox';
             checkbox.checked = todo.done;
             checkbox.addEventListener('change', () => toggleSubjectTodo(index));

             const taskText = document.createElement('span');
             taskText.textContent = todo.task;
             taskText.style.flex = '1';
             taskText.style.textDecoration = todo.done ? 'line-through' : 'none';
             taskText.style.color = todo.done ? 'var(--text-secondary)' : 'var(--text-primary)';

             const deleteBtn = document.createElement('button');
             deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
             deleteBtn.style.background = 'none';
             deleteBtn.style.border = 'none';
             deleteBtn.style.color = 'var(--color-danger)';
             deleteBtn.style.cursor = 'pointer';
             deleteBtn.style.padding = '4px 8px';
             deleteBtn.addEventListener('click', () => deleteSubjectTodo(index));

             li.appendChild(checkbox);
             li.appendChild(taskText);
             li.appendChild(deleteBtn);
             subjectTodoList.appendChild(li);
         });
     }

     // 과목 투두 추가
     function addSubjectTodo() {
         if (!subjectTodoInput || !selectedSubjectForDailyMemo) return;
         const taskText = subjectTodoInput.value.trim();
         if (taskText === '') return;

         currentSubjectTodos.push({
             task: taskText,
             done: false
         });

         renderSubjectTodos();
         subjectTodoInput.value = '';
     }

     // 과목 투두 토글
     function toggleSubjectTodo(index) {
         if (index < 0 || index >= currentSubjectTodos.length) return;
         currentSubjectTodos[index].done = !currentSubjectTodos[index].done;
         renderSubjectTodos();
     }

     // 과목 투두 삭제
     function deleteSubjectTodo(index) {
         if (index < 0 || index >= currentSubjectTodos.length) return;
         currentSubjectTodos.splice(index, 1);
         renderSubjectTodos();
     }

     // *** 수정: '주차별 메모 모아보기' 모달 열기 - 학기 ID 사용 ***
     async function openAllMemosModal(semesterId) {
        if (!semesterId || !allMemosModal) {
            alert("먼저 학기를 선택해주세요.");
            return;
        }

        const modalTitle = allMemosModal.querySelector('.modal-header h3');
        const accordionContainer = allMemosModal.querySelector('#allMemosAccordion');
        const semesterName = currentSemesterInfo ? currentSemesterInfo.name : "현재 학기"; // 학기 이름 표시

        if (modalTitle) modalTitle.textContent = `${semesterName} - 주차별 메모 모아보기`;
        if (accordionContainer) accordionContainer.innerHTML = '<div class="loading-spinner-small"></div>';
        allMemosModal.classList.add('active');

        try {
            // *** 수정: API 엔드포인트 변경 ***
            const response = await fetch(`/api/semesters/${semesterId}/all-memos-by-week`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            if (Array.isArray(result.data)) {
                // *** 수정: renderAllMemosAccordion 호출 ***
                renderAllMemosAccordion(result.data, accordionContainer);
            } else {
                console.error("API response data is not an array:", result.data);
                throw new Error("데이터 형식이 올바르지 않습니다.");
            }
        } catch (error) {
             console.error("주차별 메모 로드 실패:", error);
             if (accordionContainer) accordionContainer.innerHTML = `<p class="todo-summary-empty">${error.message}</p>`;
        }
     }

    // *** 수정: '주차별 메모 모아보기' 아코디언 렌더링 - 과목별 그룹화 ***
     function renderAllMemosAccordion(allWeeksData, container) {
         if (!container) return;
        container.innerHTML = '';

        // 주차 데이터가 하나라도 있는지, 그 안에 과목 데이터가 하나라도 있는지 확인
        const hasAnyContent = Array.isArray(allWeeksData) && allWeeksData.some(week => week.subjects && week.subjects.length > 0);

        if (!hasAnyContent) {
            container.innerHTML = `<p class="todo-summary-empty">이 학기에는 기록된 주차별 메모가 없습니다.</p>`;
            return;
        }

        allWeeksData.forEach(week => {
             const weekSubjects = week.subjects || [];
             // 해당 주차에 메모가 있는 과목이 있을 때만 아코디언 항목 생성
             if (weekSubjects.length === 0) return;

             const itemDiv = document.createElement('div');
             itemDiv.className = 'accordion-item';

             // --- 과목별 메모 HTML 생성 ---
             let subjectsHtml = '';
             weekSubjects.forEach(subjectData => {
                 if (!subjectData.memos || subjectData.memos.length === 0) return; // 메모 없으면 건너뛰기

                 subjectsHtml += `<div class="subject-memo-group">
                                    <h5 class="subject-memo-title">${subjectData.subject_name}</h5>`;

                 subjectsHtml += subjectData.memos.map(memo =>
                     `<div class="daily-memo-entry">
                        <span class="memo-date">${memo.date} (${new Date(memo.date).toLocaleDateString('ko-KR', { weekday: 'short' })})</span>
                        <p class="memo-note">${memo.note}</p>
                      </div>`
                 ).join('');

                 subjectsHtml += `</div>`; // subject-memo-group 닫기
             });
             // --- 과목별 메모 HTML 생성 끝 ---

             // 과목별 내용이 있을 때만 아코디언 항목 생성
             if (subjectsHtml) {
                 itemDiv.innerHTML = `
                     <div class="accordion-header">
                         <span class="week-title">${week.week_number}주차 (${week.date_range})</span>
                         <i class="fas fa-chevron-down"></i>
                     </div>
                     <div class="accordion-content">
                         ${subjectsHtml}
                     </div>
                 `;
                 container.appendChild(itemDiv);
             }
         });

         // 아코디언 토글 이벤트 리스너 추가
         container.querySelectorAll('.accordion-header').forEach(header => {
             header.addEventListener('click', () => {
                 const content = header.nextElementSibling;
                 const item = header.parentElement;
                 const isActive = item.classList.contains('active');

                 // 모든 활성 아코디언 닫기 (선택사항: 하나만 열리게 하려면)
                 // container.querySelectorAll('.accordion-item.active').forEach(activeItem => {
                 //     if (activeItem !== item) {
                 //         activeItem.classList.remove('active');
                 //         activeItem.querySelector('.accordion-content').style.maxHeight = null;
                 //     }
                 // });

                 item.classList.toggle('active', !isActive);
                 if (content) {
                     content.style.maxHeight = isActive ? null : content.scrollHeight + 32 + "px"; // padding 고려
                 }
             });
         });

         // 만약 생성된 아코디언 항목이 없다면 메시지 표시
         if (container.children.length === 0) {
              container.innerHTML = `<p class="todo-summary-empty">이 학기에는 기록된 주차별 메모가 없습니다.</p>`;
         }
     }

     // 오른쪽 과목 상세 패널 리셋
     function resetSubjectDetailsPanel(message = "학기를 선택해주세요.") {
          if(subjectDetailsListUl) subjectDetailsListUl.innerHTML = `<li class="subject-details-empty">${message}</li>`;
     }

     // 일일 메모 패널 리셋 및 비활성화 - Req 1
     function resetDailyMemoPanel() {
         if (dailyMemoTitle) dailyMemoTitle.innerHTML = '<i class="fas fa-pencil-alt"></i> 오늘 메모';
         if (dailyMemoSubjectName) dailyMemoSubjectName.textContent = "과목 선택";
         if (currentMemoDateEl) currentMemoDateEl.textContent = '';
         if (dailyMemoText) dailyMemoText.value = '';

         currentDailyMemoData = { note: "" };
         disableDailyMemoPanel();
         // *** 수정: selectedSubjectForDetails 대신 selectedSubjectForDailyMemo 사용 ***
         selectedSubjectForDailyMemo = null;
         if(subjectDetailsListUl) subjectDetailsListUl.querySelectorAll('.subject-details-item.selected').forEach(el => el.classList.remove('selected'));
     }

     // 일일 메모 패널 활성화 - Req 1
     function enableDailyMemoPanel() {
         if (dailyMemoText) dailyMemoText.disabled = false;
         if (saveDailyMemoBtn) {
            saveDailyMemoBtn.disabled = false;
            saveDailyMemoBtn.innerHTML = '<i class="fas fa-save"></i> 메모 저장';
         }
         if (subjectTodoInput) subjectTodoInput.disabled = false;
         if (addSubjectTodoBtn) addSubjectTodoBtn.disabled = false;
     }

     // 일일 메모 패널 비활성화 - Req 1
     function disableDailyMemoPanel() {
         if (dailyMemoText) dailyMemoText.disabled = true;
         if (saveDailyMemoBtn) {
            saveDailyMemoBtn.disabled = true;
            saveDailyMemoBtn.innerHTML = '<i class="fas fa-save"></i> 메모 저장';
         }
         if (subjectTodoInput) subjectTodoInput.disabled = true;
         if (addSubjectTodoBtn) addSubjectTodoBtn.disabled = true;
     }

    // 학점 진행률 업데이트
    function updateCreditProgress(current, goal) {
         if (!currentCreditsEl || !goalCreditsEl || !remainingCreditsEl || !creditPercentageEl) return;
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

    // 목표 학점 저장
    async function saveCreditGoal() {
         if (!newGoalInput || !saveGoalBtn || !currentCreditsEl || !editGoalForm || !editGoalBtn) return;
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

    // 새 과목 추가 모달 열기
    function openAddSubjectModal() {
        if (!currentSemesterId) { alert("과목을 추가할 학기를 선택해주세요."); return; }
        if (!addSubjectModal || !addSubjectForm || !addSubjectSemesterIdInput || !addTimeSlotContainer) return;
        addSubjectForm.reset();
        addSubjectSemesterIdInput.value = currentSemesterId;
        addTimeSlotContainer.innerHTML = '';
        createTimeSlotEntry(null, addTimeSlotContainer);
        addSubjectModal.classList.add('active');
    }

    // 과목 수정 모달 열기
    function openEditSubjectModal(subjectId) {
        if (!editSubjectModal || !editSubjectIdInput || !editNameInput || !editProfInput || !editCreditsInput || !editGradeInput || !editTimeSlotContainer) return;
        const subject = currentSubjects.find(s => s.id === subjectId);
        if (!subject) return;
        editSubjectIdInput.value = subject.id;
        editNameInput.value = subject.name;
        editProfInput.value = subject.professor || '';
        editCreditsInput.value = subject.credits;
        editGradeInput.value = subject.grade || "Not Set";
        editTimeSlotContainer.innerHTML = '';
        if (subject.timeslots && subject.timeslots.length > 0) {
            subject.timeslots.forEach(ts => createTimeSlotEntry(ts, editTimeSlotContainer));
        } else {
            createTimeSlotEntry(null, editTimeSlotContainer);
        }
        editSubjectModal.classList.add('active');
    }

    // 시간/장소 입력 슬롯 생성
    function createTimeSlotEntry(timeslot, container) {
        if (!container) return;
        const entryDiv = document.createElement('div');
        entryDiv.className = 'timeslot-entry';
        entryDiv.innerHTML = `
            <select name="day" title="요일">
                <option value="1" ${timeslot && timeslot.day == 1 ? 'selected' : ''}>월</option>
                <option value="2" ${timeslot && timeslot.day == 2 ? 'selected' : ''}>화</option>
                <option value="3" ${timeslot && timeslot.day == 3 ? 'selected' : ''}>수</option>
                <option value="4" ${timeslot && timeslot.day == 4 ? 'selected' : ''}>목</option>
                <option value="5" ${timeslot && timeslot.day == 5 ? 'selected' : ''}>금</option>
            </select>
            <input type="time" name="start_time" value="${timeslot ? (timeslot.start || '09:00') : '09:00'}" title="시작 시간">
            <input type="time" name="end_time" value="${timeslot ? (timeslot.end || '10:15') : '10:15'}" title="종료 시간">
            <input type="text" name="room" placeholder="강의실" value="${timeslot ? (timeslot.room || '') : ''}" title="강의실">
            <button type="button" class="timeslot-delete-btn" title="시간 삭제">&times;</button>
        `;
        entryDiv.querySelector('.timeslot-delete-btn').addEventListener('click', () => entryDiv.remove());
        container.appendChild(entryDiv);
    }

    // 새 과목 저장
    async function saveNewSubject() {
         if (!addSubjectSemesterIdInput || !addNameInput || !addProfInput || !addCreditsInput || !addTimeSlotContainer || !saveNewSubjectBtn || !addSubjectModal) return;

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

            // --- 수정 (Req 1) ---
            // '총 이수 학점' 즉시 업데이트
            if (currentCreditsEl && result.total_earned_credits !== undefined) {
                const newTotalCredits = result.total_earned_credits;
                const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;
                updateCreditProgress(newTotalCredits, currentGoal);
            }

            // 로컬 데이터에 새 과목 추가
            currentSubjects.push(result.subject);

            // UI 다시 렌더링
            renderTimetableGrid(currentSubjects);
            renderSubjectDetailsList(currentSubjects);
            // --- 수정 끝 ---

            await loadGpaStats(); // GPA 차트 동기화
        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveNewSubjectBtn.disabled = false;
        }
    }

    // 과목 정보 수정
    async function updateSubject() {
         if (!editSubjectIdInput || !editNameInput || !editProfInput || !editCreditsInput || !editGradeInput || !editTimeSlotContainer || !updateSubjectBtn || !editSubjectModal) return;

        const subjectId = editSubjectIdInput.value;
        const subject = currentSubjects.find(s => s.id === parseInt(subjectId, 10));
        if (!subject) return;

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
        };
        if (!data.name) { alert('과목명은 필수입니다.'); return; }

        updateSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');

            // 로컬 데이터 업데이트
            const updatedSubjectData = result.subject;
            const index = currentSubjects.findIndex(s => s.id === updatedSubjectData.id);
            if (index !== -1) {
                 currentSubjects[index] = { ...updatedSubjectData };
            }

            // UI 다시 렌더링
            renderTimetableGrid(currentSubjects);
            renderSubjectDetailsList(currentSubjects);

            // 일일 메모 패널 업데이트 (선택된 과목이면)
            // *** 수정: selectedSubjectForDetails 대신 selectedSubjectForDailyMemo 사용 ***
            if (selectedSubjectForDailyMemo && selectedSubjectForDailyMemo.id === updatedSubjectData.id) {
                 selectSubjectForDailyMemo(updatedSubjectData.id);
            }

            // --- 수정 (Req 1) ---
            // '총 이수 학점' 즉시 업데이트
            if (currentCreditsEl && result.total_earned_credits !== undefined) {
                const newTotalCredits = result.total_earned_credits;
                const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;
                updateCreditProgress(newTotalCredits, currentGoal);
            }
            // --- 수정 끝 ---

            await loadGpaStats(); // GPA 차트 동기화

        } catch (error) {
            alert(`수정 실패: ${error.message}`);
        } finally {
            updateSubjectBtn.disabled = false;
        }
    }

    // 과목 삭제
    async function deleteSubject() {
         if (!editSubjectIdInput || !deleteSubjectBtn || !editSubjectModal) return;

        const subjectId = editSubjectIdInput.value;
        if (!subjectId || !confirm('정말로 이 과목을 삭제하시겠습니까? 관련된 시간표, 메모 정보도 모두 삭제됩니다.')) return;

        deleteSubjectBtn.disabled = true;
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            editSubjectModal.classList.remove('active');

            currentSubjects = currentSubjects.filter(s => s.id !== parseInt(subjectId, 10));

            renderTimetableGrid(currentSubjects);
            renderSubjectDetailsList(currentSubjects);

            // *** 수정: selectedSubjectForDetails 대신 selectedSubjectForDailyMemo 사용 ***
            if (selectedSubjectForDailyMemo && selectedSubjectForDailyMemo.id === parseInt(subjectId, 10)) {
                resetDailyMemoPanel(); // Req 1
            }

            // --- 수정 (Req 1) ---
            // '총 이수 학점' 즉시 업데이트
            if (currentCreditsEl && result.total_earned_credits !== undefined) {
                const newTotalCredits = result.total_earned_credits;
                const currentGoal = goalCreditsEl ? parseInt(goalCreditsEl.textContent, 10) : 130;
                updateCreditProgress(newTotalCredits, currentGoal);
            }
            // --- 수정 끝 ---

            await loadGpaStats(); // GPA 차트 동기화
        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteSubjectBtn.disabled = false;
        }
    }

    // --- Helper Functions ---

    // --- Global Todo 위젯 관련 Helper Functions ---

    // 현재 날짜 기준 주의 시작(월)/종료(일)일 계산
    function getWeekRange(date) {
        const today = new Date(date.setHours(0,0,0,0));
        const dayOfWeek = today.getDay(); // 0:일, 1:월, ..., 6:토
        const diffToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
        const monday = new Date(new Date(today).setDate(today.getDate() + diffToMonday));
        const sunday = new Date(new Date(monday).setDate(monday.getDate() + 6));
        return { start: monday, end: sunday };
    }

    // 날짜 포맷팅 (YYYY-MM-DD)
    function formatDateYYYYMMDD(date) {
        if (!date) return '';
        return date.toISOString().split('T')[0];
    }

    // 날짜 포맷팅 (MM.DD)
    function formatDateMMDD(date) {
        if (!date) return '';
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}.${day}`;
    }

    // Global Todo 위젯 활성화/비활성화
    function enableGlobalTodoWidget() {
        if (!globalTodoWidget) return;
        if(globalNewTodoInput) globalNewTodoInput.disabled = false;
        if(globalAddTodoBtn) globalAddTodoBtn.disabled = false;
    }
    function disableGlobalTodoWidget(message = "학기를 선택하세요.") {
        if (!globalTodoWidget) return;
        if(globalNewTodoInput) { globalNewTodoInput.value = ''; globalNewTodoInput.disabled = true; }
        if(globalAddTodoBtn) globalAddTodoBtn.disabled = true;
        if(globalTodoList) globalTodoList.innerHTML = `<li class="todo-empty">${message}</li>`;
        if(globalTodoWeekRangeEl) globalTodoWeekRangeEl.textContent = "";
        currentGlobalTodos = [];
        currentWeekStartDate = null;
        hideGlobalTagSuggestions();
    }

    // Global Todo 로드 및 렌더링
    async function loadAndRenderGlobalTodos(date) {
        if (!currentSemesterId) {
            disableGlobalTodoWidget("학기를 선택하세요.");
            return;
        }
        enableGlobalTodoWidget();
        if(globalTodoList) globalTodoList.innerHTML = '<li class="todo-empty">Todo 로딩 중...</li>';

        const weekRange = getWeekRange(date);
        currentWeekStartDate = weekRange.start;
        const startDateStr = formatDateYYYYMMDD(weekRange.start);
        const endDateStr = formatDateYYYYMMDD(weekRange.end);

        if(globalTodoWeekRangeEl) {
             globalTodoWeekRangeEl.textContent = `${formatDateMMDD(weekRange.start)} ~ ${formatDateMMDD(weekRange.end)}`;
        }

        try {
            const response = await fetch(`/api/todos?semester_id=${currentSemesterId}&start_date=${startDateStr}&end_date=${endDateStr}`);
            if (!response.ok) throw new Error('Todo 로드 실패');
            const data = await response.json();

            if (data.status === 'success') {
                currentGlobalTodos = data.todos || [];
                selectedTodoDay = new Date().getDay(); // 오늘 요일로 리셋
                updateTodoDaySelection(selectedTodoDay);
                renderGlobalTodoList();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error("Failed to load global todos:", error);
            if(globalTodoList) globalTodoList.innerHTML = `<li class="todo-empty">${error.message}</li>`;
        }
    }

    // Global Todo 요일 선택 UI 업데이트
    function updateTodoDaySelection(dayIndex) {
        if (!globalTodoWidget) return;
        globalTodoWidget.querySelectorAll('.global-day-selector .day-circle').forEach(button => {
            button.classList.toggle('active', parseInt(button.dataset.day, 10) === dayIndex);
        });
    }

    // Global Todo 리스트 렌더링 (선택된 요일 기준)
    function renderGlobalTodoList() {
        if (!globalTodoList) return;
        globalTodoList.innerHTML = '';

        if (!currentSemesterId) {
            globalTodoList.innerHTML = '<li class="todo-empty">학기를 선택하세요.</li>';
            return;
        }

        const targetDate = new Date(currentWeekStartDate);
        const dayOffset = (selectedTodoDay === 0) ? 6 : selectedTodoDay - 1;
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatDateYYYYMMDD(targetDate);

        const todosToDisplay = currentGlobalTodos.filter(todo => todo.due_date === targetDateStr);

        if (todosToDisplay.length === 0) {
            globalTodoList.innerHTML = '<li class="todo-empty">할 일이 없습니다.</li>';
            return;
        }

        todosToDisplay.forEach((todo) => {
            const li = document.createElement('li');
            li.className = todo.done ? 'todo-item done' : 'todo-item';
            li.setAttribute('data-todo-id', todo.id);
            const todoId = `global-todo-${todo.id}`;

            // @태그 스타일링 적용 (Req 4)
            const taggedTask = highlightTaggedSubjects(todo.task);

            li.innerHTML = `
                <input type="checkbox" id="${todoId}" ${todo.done ? 'checked' : ''}>
                <label for="${todoId}" class="todo-label">${taggedTask}</label>
                <span class="todo-delete-btn" title="삭제">&times;</span>
            `;

            li.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
                const isDone = e.target.checked;
                li.classList.toggle('done', isDone);
                todo.done = isDone;
                try {
                    await fetch(`/api/todos/${todo.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ done: isDone })
                    });
                } catch (error) {
                    console.error("Todo 업데이트 실패:", error);
                    e.target.checked = !isDone;
                    li.classList.toggle('done', !isDone);
                    todo.done = !isDone;
                }
            });

            li.querySelector('.todo-delete-btn').addEventListener('click', async (e) => {
                if (!confirm("이 Todo를 삭제하시겠습니까?")) return;
                try {
                    await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
                    currentGlobalTodos = currentGlobalTodos.filter(t => t.id !== todo.id);
                    renderGlobalTodoList();
                } catch (error) {
                    console.error("Todo 삭제 실패:", error);
                    alert("삭제에 실패했습니다.");
                }
            });
            globalTodoList.appendChild(li);
        });
    }

    // Global Todo 항목 추가 (API 호출)
    async function addGlobalTodo() {
        if (!globalNewTodoInput || !currentSemesterId || !currentWeekStartDate) return;
        const taskText = globalNewTodoInput.value.trim();
        if (taskText === '') return;

        const targetDate = new Date(currentWeekStartDate);
        const dayOffset = (selectedTodoDay === 0) ? 6 : selectedTodoDay - 1;
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatDateYYYYMMDD(targetDate);

        const newTodoData = {
            task: taskText,
            due_date: targetDateStr,
            semester_id: currentSemesterId
        };

        globalAddTodoBtn.disabled = true;
        globalNewTodoInput.disabled = true;

        try {
            const response = await fetch('/api/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTodoData)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            currentGlobalTodos.push(result.todo);
            renderGlobalTodoList();
            globalNewTodoInput.value = '';

        } catch (error) {
            console.error("Todo 추가 실패:", error);
            alert(`Todo 추가 실패: ${error.message}`);
        } finally {
            globalAddTodoBtn.disabled = false;
            globalNewTodoInput.disabled = false;
            globalNewTodoInput.focus();
        }
    }

    // --- @ 태그 관련 함수 ---
    function handleGlobalTodoInputTagging(event) {
        const input = event.target;
        const value = input.value;
        const cursorPos = input.selectionStart;
        const textBeforeCursor = value.substring(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@([\wㄱ-ㅎㅏ-ㅣ가-힣]*)$/);

        if (atMatch && currentSubjects && currentSubjects.length > 0) { // currentSubjects 확인 추가
            const query = atMatch[1].toLowerCase();
            const suggestions = currentSubjects.filter(subject =>
                subject.name.toLowerCase().includes(query)
            );
            showGlobalTagSuggestions(suggestions, input);
        } else {
            hideGlobalTagSuggestions();
        }
    }

    function showGlobalTagSuggestions(suggestions, inputElement) {
        if (!globalTagSuggestionOverlay) return;
        globalTagSuggestionOverlay.innerHTML = '';
        if (suggestions.length === 0) {
            hideGlobalTagSuggestions();
            return;
        }

        suggestions.slice(0, 5).forEach(subject => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = subject.name;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectGlobalTagSuggestion(subject.name);
            });
            globalTagSuggestionOverlay.appendChild(item);
        });

        // --- 수정 (Req 2): CSS가 위치를 처리하므로 JS 위치 지정 로직 제거 ---
        globalTagSuggestionOverlay.style.display = 'block';
    }

    function hideGlobalTagSuggestions() {
        if (globalTagSuggestionOverlay) globalTagSuggestionOverlay.style.display = 'none';
    }

    function selectGlobalTagSuggestion(subjectName) {
        if (!globalNewTodoInput) return;
        const value = globalNewTodoInput.value;
        const cursorPos = globalNewTodoInput.selectionStart;
        const beforeCursor = value.substring(0, cursorPos);
        const atIndex = beforeCursor.lastIndexOf('@');
        if (atIndex === -1) return;

        const newValue = value.substring(0, atIndex + 1) + subjectName + " " + value.substring(cursorPos);
        globalNewTodoInput.value = newValue;
        hideGlobalTagSuggestions();
        globalNewTodoInput.focus();
        const newCursorPos = atIndex + 1 + subjectName.length + 1;
        globalNewTodoInput.setSelectionRange(newCursorPos, newCursorPos);
    }

    // Todo 텍스트에서 @태그된 과목명 하이라이팅 (Req 4)
    function highlightTaggedSubjects(taskText) {
        if (!taskText || typeof taskText !== 'string' || !currentSubjects) return taskText; // currentSubjects 확인 추가
        return taskText.replace(/@([\wㄱ-ㅎㅏ-ㅣ가-힣]+)/g, (match, subjectName) => {
            const subject = currentSubjects.find(s => s.name === subjectName);
            if (subject && subjectColorMap[subject.id]) {
                // --- 수정 (Req 2): 디자인 개선을 위해 색상 로직 변경 ---
                const subjectColor = subjectColorMap[subject.id] || 'rgba(165, 0, 52, 0.1)';
                const backgroundColor = subjectColor.replace('0.1', '0.15'); // 배경색 살짝 연하게
                const borderColor = subjectColor.replace('0.1', '0.5'); // 테두리색
                // 인라인 스타일로 색상 적용
                return `<span class="tagged-subject-global" style="background-color: ${backgroundColor}; border-color: ${borderColor};">${match}</span>`;
                // --- 수정 끝 ---
            } else {
                return match; // 과목 없거나 색상 없으면 그대로
            }
        });
    }

    initializePage(); // 페이지 초기화 함수 실행
});