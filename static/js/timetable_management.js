document.addEventListener('DOMContentLoaded', () => {
    // 전역 변수
    let timetableData = [];
    let currentCredits = 0;
    let goalCredits = 130;

    // 모달 DOM
    const modal = document.getElementById('subjectEditModal');
    const modalTitle = document.getElementById('subjectModalTitle');
    const form = document.getElementById('subjectEditForm');
    const dayInput = document.getElementById('subjectDay');
    const periodInput = document.getElementById('subjectPeriod');
    const nameInput = document.getElementById('subjectName');
    const profInput = document.getElementById('subjectProfessor');
    const roomInput = document.getElementById('subjectRoom');
    const creditsInput = document.getElementById('subjectCredits');
    const saveBtn = document.getElementById('saveSubjectBtn');
    const deleteBtn = document.getElementById('deleteSubjectBtn');
    
    // 학점 위젯 DOM
    const currentCreditsEl = document.getElementById('currentCredits');
    const goalCreditsEl = document.getElementById('goalCredits');
    const remainingCreditsEl = document.getElementById('remainingCredits');
    const creditProgressCircle = document.getElementById('creditProgress');
    const creditPercentageEl = document.getElementById('creditPercentage');
    
    // 목표 학점 수정 DOM
    const editGoalBtn = document.getElementById('editGoalBtn');
    const editGoalForm = document.getElementById('editGoalForm');
    const newGoalInput = document.getElementById('newGoalCredits');
    const saveGoalBtn = document.getElementById('saveGoalBtn');
    const cancelGoalBtn = document.getElementById('cancelGoalBtn');


    // 초기 데이터 로드
    function initializePage() {
        // DOM에서 초기 학점 값 읽기
        currentCredits = parseInt(currentCreditsEl.textContent, 10) || 0;
        goalCredits = parseInt(goalCreditsEl.textContent, 10) || 130;
        
        loadTimetableData();
        setupEventListeners();
        updateCreditProgress();
    }

    // 1. 데이터 로드 및 표시
    async function loadTimetableData() {
        try {
            const response = await fetch('/api/timetable');
            if (!response.ok) throw new Error('시간표 로드 실패');
            
            timetableData = await response.json();
            displayTimetable();
            loadTodoSummary();
            updateCreditProgress(); // 학점 정보가 업데이트 될 수 있으므로 재계산

        } catch (error) {
            console.error(error);
            document.getElementById('timetableEditorBody').innerHTML = 
                `<tr><td colspan="6" class="todo-summary-empty">${error.message}</td></tr>`;
            document.getElementById('todoSummaryList').innerHTML = 
                `<p class="todo-summary-empty">${error.message}</p>`;
        }
    }

    // 2. 시간표 편집기 표시
    function displayTimetable() {
        const tbody = document.getElementById('timetableEditorBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const periods = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30'];
        
        const timetableMap = (timetableData || []).reduce((map, item) => {
            map[`${item.day}-${item.period}`] = item;
            return map;
        }, {});

        for (let period = 1; period <= 6; period++) {
            const row = document.createElement('tr');
            
            const timeCell = document.createElement('td');
            timeCell.innerHTML = `<b>${period}교시</b><br>${periods[period - 1]}`;
            timeCell.style.fontWeight = '600';
            timeCell.style.background = 'var(--bg-primary)';
            timeCell.style.fontSize = '11px';
            row.appendChild(timeCell);
            
            for (let day = 1; day <= 5; day++) {
                const cell = document.createElement('td');
                const key = `${day}-${period}`;
                const item = timetableMap[key];
                
                const cellDiv = document.createElement('div');
                cellDiv.className = 'timetable-cell';
                
                if (item && item.subject) {
                    // 과목 있음
                    cellDiv.innerHTML = `
                        <div class="timetable-subject">${item.subject}</div>
                        <div class="timetable-professor">${item.professor || '-'}</div>
                        <div class="timetable-room">${item.room || '-'}</div>
                        <div class="timetable-credits">${item.credits}학점</div>
                    `;
                } else {
                    // 과목 없음 (빈 칸)
                    cellDiv.classList.add('empty');
                    cellDiv.innerHTML = `<i class="fas fa-plus"></i><span style="font-size: 11px; margin-top: 4px;">추가</span>`;
                }
                
                // 클릭 이벤트 (item 객체 또는 빈 객체 전달)
                cellDiv.addEventListener('click', () => {
                    openSubjectEditModal(day, period, item || null);
                });
                
                cell.appendChild(cellDiv);
                row.appendChild(cell);
            }
            tbody.appendChild(row);
        }
    }

    // 3. Todo 요약 목록 표시
    function loadTodoSummary() {
        const container = document.getElementById('todoSummaryList');
        container.innerHTML = '';
        
        const subjectsWithTodos = timetableData.filter(item => 
            item.subject && item.memo && item.memo.todos && item.memo.todos.length > 0
        );

        if (subjectsWithTodos.length === 0) {
            container.innerHTML = '<p class="todo-summary-empty">등록된 할 일이 없습니다.</p>';
            return;
        }

        subjectsWithTodos.forEach(item => {
            const pendingTodos = item.memo.todos.filter(t => !t.done);
            const isCompleted = pendingTodos.length === 0;

            const itemDiv = document.createElement('div');
            itemDiv.className = isCompleted ? 'todo-summary-item completed' : 'todo-summary-item';
            
            let todoHtml = '<ul class="todo-list">';
            item.memo.todos.forEach(todo => {
                todoHtml += `
                    <li class="todo-list-item ${todo.done ? 'done' : 'pending'}">
                        <i class="fas ${todo.done ? 'fa-check-square' : 'fa-square'}"></i>
                        ${todo.task}
                    </li>
                `;
            });
            todoHtml += '</ul>';

            itemDiv.innerHTML = `
                <div class="todo-subject">
                    <i class="fas fa-book"></i>
                    ${item.subject} 
                    (${isCompleted ? '완료' : `${pendingTodos.length}개 남음`})
                </div>
                ${todoHtml}
            `;
            container.appendChild(itemDiv);
        });
    }

    // 4. 학점 진행률 업데이트
    function updateCreditProgress() {
        // DB에서 받은 최신 학점 정보로 다시 계산
        const uniqueSubjects = {};
        timetableData.forEach(entry => {
            if (entry.subject && entry.credits > 0) {
                const key = (entry.subject, entry.professor);
                if (!uniqueSubjects[key]) {
                    uniqueSubjects[key] = entry.credits;
                }
            }
        });
        
        currentCredits = Object.values(uniqueSubjects).reduce((sum, val) => sum + val, 0);
        
        const remaining = Math.max(0, goalCredits - currentCredits);
        const percentage = (goalCredits > 0) ? Math.min(100, (currentCredits / goalCredits) * 100) : 0;
        const dashoffset = 283 - (283 * percentage / 100);

        currentCreditsEl.textContent = currentCredits;
        goalCreditsEl.textContent = goalCredits;
        remainingCreditsEl.textContent = remaining;
        creditPercentageEl.textContent = `${Math.round(percentage)}%`;
        creditProgressCircle.style.strokeDashoffset = dashoffset;
    }

    // 5. 이벤트 리스너 설정
    function setupEventListeners() {
        // 과목 저장 버튼
        saveBtn.addEventListener('click', saveSubject);
        // 과목 삭제 버튼
        deleteBtn.addEventListener('click', deleteSubject);
        
        // 모달 닫기 버튼
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.classList.remove('active'));
        });
        
        // 목표 학점 수정 버튼
        editGoalBtn.addEventListener('click', () => {
            editGoalForm.style.display = 'block';
            editGoalBtn.style.display = 'none';
        });

        // 목표 학점 취소 버튼
        cancelGoalBtn.addEventListener('click', () => {
            editGoalForm.style.display = 'none';
            editGoalBtn.style.display = 'inline-block';
            newGoalInput.value = goalCredits; // 원래 값으로 복원
        });

        // 목표 학점 저장 버튼
        saveGoalBtn.addEventListener('click', saveCreditGoal);
    }

    // 6. 과목 수정 모달 열기
    function openSubjectEditModal(day, period, item) {
        dayInput.value = day;
        periodInput.value = period;

        if (item) {
            // 기존 과목 수정
            modalTitle.textContent = "과목 수정";
            nameInput.value = item.subject || '';
            profInput.value = item.professor || '';
            roomInput.value = item.room || '';
            creditsInput.value = item.credits || 0;
            deleteBtn.style.display = 'block'; // 삭제 버튼 표시
        } else {
            // 새 과목 추가
            modalTitle.textContent = "과목 추가";
            form.reset(); // 폼 초기화
            dayInput.value = day; // day, period는 다시 설정
            periodInput.value = period;
            creditsInput.value = 3; // 기본 학점
            deleteBtn.style.display = 'none'; // 삭제 버튼 숨김
        }
        
        modal.classList.add('active');
    }

    // 7. API 호출: 과목 저장 (POST)
    async function saveSubject() {
        const data = {
            day: parseInt(dayInput.value, 10),
            period: parseInt(periodInput.value, 10),
            subject: nameInput.value.trim(),
            professor: profInput.value.trim(),
            room: roomInput.value.trim(),
            credits: parseInt(creditsInput.value, 10) || 0
        };

        if (!data.subject) {
            alert('과목명은 필수입니다.');
            return;
        }
        
        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';

        try {
            const response = await fetch('/api/timetable/subject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            modal.classList.remove('active');
            await loadTimetableData(); // 데이터 새로고침
            
        } catch (error) {
            alert(`저장 실패: ${error.message}`);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '저장';
        }
    }

    // 8. API 호출: 과목 삭제 (DELETE)
    async function deleteSubject() {
        if (!confirm('정말로 이 과목을 삭제하시겠습니까? (메모/Todo도 함께 삭제됩니다)')) {
            return;
        }

        const data = {
            day: parseInt(dayInput.value, 10),
            period: parseInt(periodInput.value, 10)
        };
        
        deleteBtn.disabled = true;

        try {
            const response = await fetch('/api/timetable/subject', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            
            modal.classList.remove('active');
            await loadTimetableData(); // 데이터 새로고침

        } catch (error) {
            alert(`삭제 실패: ${error.message}`);
        } finally {
            deleteBtn.disabled = false;
        }
    }

    // 9. API 호출: 목표 학점 저장 (POST)
    async function saveCreditGoal() {
        const newGoal = parseInt(newGoalInput.value, 10);
        if (isNaN(newGoal) || newGoal <= 0) {
            alert('유효한 학점을 입력하세요 (1 이상).');
            return;
        }

        saveGoalBtn.disabled = true;

        try {
            const response = await fetch('/api/credits/goal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal: newGoal })
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            // 성공
            goalCredits = result.new_goal; // 전역 변수 업데이트
            updateCreditProgress(); // UI 업데이트
            
            // 폼 숨기기
            editGoalForm.style.display = 'none';
            editGoalBtn.style.display = 'inline-block';

        } catch (error) {
            alert(`목표 학점 저장 실패: ${error.message}`);
        } finally {
            saveGoalBtn.disabled = false;
        }
    }

    // --- 페이지 초기화 실행 ---
    initializePage();
});