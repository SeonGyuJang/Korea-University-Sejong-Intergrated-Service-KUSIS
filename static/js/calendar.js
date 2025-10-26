// ==================== 노션 스타일 캘린더 JavaScript ====================

// 전역 변수
let calendar;
let categories = [];
let allEvents = [];
let visibleCategories = new Set();
let currentMiniCalendarDate = new Date();
let selectedEventId = null;
let selectedMiniCalendarDate = null; // 미니 캘린더에서 선택한 날짜

// 편집 상태 (NEW)
let editingTempEvent = null; // 임시 이벤트 객체

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
    loadCategories();
    renderMiniCalendar();
    setupEventListeners();
    setupKeyboardShortcuts();
});

// ==================== FullCalendar 초기화 ====================
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek', // 주간 뷰가 디폴트
        locale: 'ko',
        headerToolbar: false, // 커스텀 툴바 사용
        editable: true,
        selectable: true,
        selectMirror: true,
        dayMaxEvents: 3,
        weekends: true,
        height: 'auto',
        contentHeight: 'auto',
        nowIndicator: true, // 현재 시간 표시
        slotMinTime: '06:00:00',
        slotMaxTime: '24:00:00',
        slotDuration: '00:30:00',
        slotLabelInterval: '01:00',
        slotLabelFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        eventTimeFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        selectMinDistance: 5, // 5px 이상 드래그해야 선택

        // 드래그로 일정 생성 (NEW)
        select: function(info) {
            createEventByDrag(info.start, info.end, info.allDay);
            calendar.unselect();
        },

        // 날짜 클릭 (빈 공간)
        dateClick: function(info) {
            // 주간/일간 뷰에서는 select 이벤트로 처리
            // 월간 뷰에서만 빠른 추가 모달 표시
            if (calendar.view.type === 'dayGridMonth') {
                showQuickEventModal(info.dateStr);
            }
        },

        // 이벤트 클릭
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            // 임시 이벤트 클릭 시 무시 (이미 패널 열림)
            if (isTemp) {
                return;
            }

            if (isSystem) {
                showEventPreview(info.event);
            } else {
                openSidePanel(eventId);
            }
        },

        // 드래그 앤 드롭
        eventDrop: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 이동할 수 없습니다.');
                return;
            }

            // 임시 이벤트 드래그 시 폼 업데이트
            if (isTemp) {
                updateFormFromTempEvent(info.event);
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 리사이즈
        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isTemp = info.event.extendedProps.is_temp;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 수정할 수 없습니다.');
                return;
            }

            // 임시 이벤트 리사이즈 시 폼 업데이트
            if (isTemp) {
                updateFormFromTempEvent(info.event);
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 날짜 변경 시
        datesSet: function(info) {
            updateMainTitle(info.view.title);
            loadEventsInRange(info.start, info.end);
            // 미니 캘린더 업데이트 (현재 주 표시 반영)
            renderMiniCalendar();
        },

        // 이벤트 소스
        events: function(info, successCallback, failureCallback) {
            const filteredEvents = allEvents.filter(event =>
                visibleCategories.has(event.extendedProps.category_id)
            );
            successCallback(filteredEvents);
        }
    });

    calendar.render();
}

// ==================== 미니 캘린더 ====================
function renderMiniCalendar() {
    const miniCalendar = document.getElementById('miniCalendar');
    const year = currentMiniCalendarDate.getFullYear();
    const month = currentMiniCalendarDate.getMonth();

    // 헤더 업데이트
    document.getElementById('miniCalendarTitle').textContent =
        `${year}년 ${month + 1}월`;

    // 현재 주 계산 (메인 캘린더 기준)
    const currentWeekRange = getCurrentWeekRange();

    // 그리드 생성
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    let html = '<div class="mini-calendar-grid">';

    // 요일 헤더
    ['일', '월', '화', '수', '목', '금', '토'].forEach(day => {
        html += `<div class="mini-calendar-weekday">${day}</div>`;
    });

    // 이전 달 날짜
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="mini-calendar-day other-month">${prevLastDate - i}</div>`;
    }

    // 현재 주 정보 저장 (배경 추가를 위해)
    let weekHighlightInfo = null;

    // 현재 달 날짜
    const today = new Date();
    for (let day = 1; day <= lastDate; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = date.toDateString() === today.toDateString();

        // 해당 날짜에 이벤트가 있는지 확인 (표시 중인 카테고리만)
        const hasEvents = allEvents.some(e => {
            if (!visibleCategories.has(e.extendedProps.category_id)) return false;

            const eventStart = e.start.split('T')[0];
            const eventEnd = e.end ? e.end.split('T')[0] : null;

            // 시작 날짜가 일치하거나, 기간 이벤트의 범위 내에 있는 경우
            if (eventStart === dateStr) return true;
            if (eventEnd && eventStart <= dateStr && dateStr <= eventEnd) return true;

            return false;
        });

        // 현재 주에 속하는지 확인
        const isInCurrentWeek = currentWeekRange &&
            date >= currentWeekRange.start &&
            date <= currentWeekRange.end;

        // 현재 주의 첫 번째 날짜 정보 저장
        if (isInCurrentWeek && !weekHighlightInfo) {
            const gridPosition = firstDay + day;  // 그리드에서의 위치 (1-based)
            const rowNumber = Math.ceil(gridPosition / 7) + 1;  // +1은 요일 헤더 때문
            const colStart = date.getDay() + 1;  // 일요일=1, 토요일=7

            // 주의 마지막 날짜가 같은 달인지 확인
            let weekEndDay = day + (6 - date.getDay());
            let colEnd = 8;  // 기본값: 토요일 다음 (전체 주)

            // 만약 주가 다음 달로 넘어가면 이번 달 마지막까지만
            if (weekEndDay > lastDate) {
                weekEndDay = lastDate;
                const endDate = new Date(year, month, weekEndDay);
                colEnd = endDate.getDay() + 2;  // +2는 CSS Grid의 end가 exclusive이기 때문
            }

            weekHighlightInfo = {
                row: rowNumber,
                colStart: colStart,
                colEnd: colEnd
            };
        }

        // 선택된 날짜인지 확인
        const isSelected = selectedMiniCalendarDate &&
            formatDate(selectedMiniCalendarDate) === dateStr;

        let classes = 'mini-calendar-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';
        if (isSelected) classes += ' selected';

        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    // 다음 달 날짜
    const remainingDays = 42 - (firstDay + lastDate);
    for (let day = 1; day <= remainingDays; day++) {
        html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    // 현재 주 배경 추가 (날짜들 위에 오버레이)
    if (weekHighlightInfo) {
        html += `<div class="current-week-highlight" style="grid-row: ${weekHighlightInfo.row}; grid-column: ${weekHighlightInfo.colStart} / ${weekHighlightInfo.colEnd};"></div>`;
    }

    html += '</div>';
    miniCalendar.innerHTML = html;

    // 날짜 클릭 이벤트
    miniCalendar.querySelectorAll('.mini-calendar-day:not(.other-month)').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
            const dateStr = this.dataset.date;
            selectedMiniCalendarDate = new Date(dateStr);
            calendar.gotoDate(dateStr);
            renderMiniCalendar(); // 선택 상태 업데이트
        });
    });
}

// ==================== 이벤트 리스너 설정 ====================
function setupEventListeners() {
    // 검색 기능
    const searchInput = document.getElementById('eventSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            if (searchTerm === '') {
                // 검색어가 없으면 모든 이벤트 표시
                calendar.refetchEvents();
            } else {
                // 검색어가 있으면 필터링
                filterEventsBySearch(searchTerm);
            }
        });
    }

    // 미니 캘린더 네비게이션
    document.getElementById('miniPrevMonth').addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() - 1);
        renderMiniCalendar();
    });

    document.getElementById('miniNextMonth').addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() + 1);
        renderMiniCalendar();
    });

    // 오늘 버튼
    document.getElementById('todayBtn').addEventListener('click', function() {
        const today = new Date();
        currentMiniCalendarDate = new Date(today);
        calendar.today();
        renderMiniCalendar();
    });

    // 뷰 전환
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            calendar.changeView(view);

            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 카테고리 추가 버튼
    document.getElementById('addCategoryBtn').addEventListener('click', openCategoryModal);

    // 사이드 패널 닫기
    document.getElementById('closePanelBtn').addEventListener('click', closeSidePanel);
    document.getElementById('cancelEventBtn').addEventListener('click', closeSidePanel);

    // 일정 폼 제출
    document.getElementById('eventForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveEvent();
    });

    // 일정 삭제
    document.getElementById('deleteEventBtn').addEventListener('click', function() {
        if (confirm('이 일정을 삭제하시겠습니까?')) {
            deleteEvent(selectedEventId);
        }
    });

    // 종일 체크박스
    document.getElementById('eventAllDay').addEventListener('change', function() {
        const isAllDay = this.checked;
        document.getElementById('eventStartTime').style.display = isAllDay ? 'none' : 'block';
        document.getElementById('eventEndTime').style.display = isAllDay ? 'none' : 'block';

        // 실시간 바인딩: 임시 이벤트 업데이트
        if (editingTempEvent) {
            updateTempEventFromForm();
        }
    });

    // 실시간 바인딩 설정 (NEW)
    setupRealtimeBinding();

    // 반복 일정 선택
    document.getElementById('eventRecurrence').addEventListener('change', function() {
        const hasRecurrence = this.value !== '';
        document.getElementById('recurrenceOptions').style.display = hasRecurrence ? 'block' : 'none';
    });

    // 빠른 추가 모달
    document.getElementById('closeQuickModalBtn').addEventListener('click', closeQuickEventModal);
    document.getElementById('quickEventForm').addEventListener('submit', function(e) {
        e.preventDefault();
        quickAddEvent();
    });
    document.getElementById('quickDetailBtn').addEventListener('click', function() {
        // 빠른 추가에서 상세 설정으로 전환
        const dateStr = document.getElementById('quickEventDate').value;
        const title = document.getElementById('quickEventTitle').value;
        const categoryId = document.getElementById('quickEventCategory').value;

        closeQuickEventModal();
        openSidePanel(null, dateStr, title, categoryId);
    });

    // 카테고리 모달
    document.getElementById('closeCategoryModalBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('cancelCategoryBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('categoryForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveCategory();
    });

    // 색상 선택
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('categoryColor').value = this.dataset.color;
        });
    });

    // 모달 오버레이 클릭 시 닫기
    document.getElementById('categoryModalOverlay').addEventListener('click', function(e) {
        if (e.target === this) {
            closeCategoryModal();
        }
    });

    document.getElementById('quickEventModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeQuickEventModal();
        }
    });
}

// ==================== 키보드 단축키 ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // 입력 필드에 포커스가 있으면 단축키 무시
        const isInputFocused = document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.tagName === 'SELECT'
        );

        // ESC - 패널/모달 닫기
        if (e.key === 'Escape') {
            closeSidePanel();
            closeCategoryModal();
            closeQuickEventModal();
            return;
        }

        // 나머지 단축키는 입력 필드 외부에서만 작동
        if (isInputFocused) return;

        // N - 새 일정 (오늘 날짜)
        if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            const today = formatDate(new Date());
            showQuickEventModal(today);
        }

        // T - 오늘로 이동
        if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            const today = new Date();
            currentMiniCalendarDate = new Date(today);
            calendar.today();
            renderMiniCalendar();
            showNotification('오늘로 이동했습니다.');
        }

        // W - 주간 뷰
        if (e.key === 'w' || e.key === 'W') {
            e.preventDefault();
            calendar.changeView('timeGridWeek');
            updateViewButtons('timeGridWeek');
        }

        // M - 월간 뷰
        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            calendar.changeView('dayGridMonth');
            updateViewButtons('dayGridMonth');
        }

        // D - 일간 뷰
        if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            calendar.changeView('timeGridDay');
            updateViewButtons('timeGridDay');
        }

        // 좌우 화살표 - 이전/다음 주
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            calendar.prev();
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            calendar.next();
        }
    });
}

// 뷰 버튼 UI 업데이트
function updateViewButtons(viewType) {
    document.querySelectorAll('.view-btn').forEach(btn => {
        if (btn.dataset.view === viewType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// ==================== 카테고리 관리 ====================
async function loadCategories() {
    try {
        const response = await fetch('/api/calendar/categories');
        const data = await response.json();

        if (data.status === 'success') {
            categories = data.categories;

            // 모든 카테고리 기본 표시
            visibleCategories.clear();
            categories.forEach(cat => visibleCategories.add(cat.id));

            renderCategories();
            renderCategorySelect();
        }
    } catch (error) {
        console.error('카테고리 로드 실패:', error);
        showNotification('카테고리를 불러오는 중 오류가 발생했습니다.');
    }
}

function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';

    categories.forEach(category => {
        const isActive = visibleCategories.has(category.id);
        const item = document.createElement('div');
        item.className = `category-item ${isActive ? 'active' : ''}`;
        item.style.setProperty('--category-color', category.color);

        item.innerHTML = `
            <div class="category-checkbox"></div>
            <div class="category-color-dot"></div>
            <span class="category-name">${category.name}</span>
            ${category.is_system ? '<span class="category-badge">시스템</span>' : ''}
            ${!category.is_system ? `
                <div class="category-actions">
                    <button class="icon-btn delete-btn" onclick="deleteCategory(${category.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        `;

        item.addEventListener('click', function(e) {
            if (!e.target.closest('.category-actions')) {
                toggleCategoryVisibility(category.id);
            }
        });

        categoryList.appendChild(item);
    });
}

function toggleCategoryVisibility(categoryId) {
    if (visibleCategories.has(categoryId)) {
        visibleCategories.delete(categoryId);
    } else {
        visibleCategories.add(categoryId);
    }

    renderCategories();
    calendar.refetchEvents();
}

function renderCategorySelect() {
    const selects = [
        document.getElementById('eventCategory'),
        document.getElementById('quickEventCategory')
    ];

    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '';

        categories.filter(cat => !cat.is_system).forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    });
}

// ==================== 이벤트 관리 ====================
async function loadEventsInRange(start, end) {
    try {
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const response = await fetch(`/api/calendar/events?start=${startStr}&end=${endStr}`);
        const data = await response.json();

        if (data.status === 'success') {
            allEvents = data.events;
            calendar.refetchEvents();
            renderMiniCalendar();
        }
    } catch (error) {
        console.error('이벤트 로드 실패:', error);
    }
}

// ==================== 중앙 빠른 추가 모달 ====================
function showQuickEventModal(dateStr) {
    const modal = document.getElementById('quickEventModal');
    document.getElementById('quickEventDate').value = dateStr;
    document.getElementById('quickEventTitle').value = '';

    // 첫 번째 카테고리 선택
    const firstUserCategory = categories.find(cat => !cat.is_system);
    if (firstUserCategory) {
        document.getElementById('quickEventCategory').value = firstUserCategory.id;
    }

    modal.classList.add('active');
    setTimeout(() => {
        document.getElementById('quickEventTitle').focus();
    }, 100);
}

function closeQuickEventModal() {
    document.getElementById('quickEventModal').classList.remove('active');
}

async function quickAddEvent() {
    const title = document.getElementById('quickEventTitle').value.trim();
    const dateStr = document.getElementById('quickEventDate').value;
    const categoryId = document.getElementById('quickEventCategory').value;

    if (!title || !categoryId) {
        showNotification('제목과 카테고리를 입력해주세요.');
        return;
    }

    const eventData = {
        title: title,
        category_id: parseInt(categoryId),
        description: '',
        start_date: dateStr,
        end_date: null,
        all_day: true,
        start_time: null,
        end_time: null,
        recurrence_type: null,
        recurrence_end_date: null
    };

    try {
        const response = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            closeQuickEventModal();
            refreshEvents();
            showNotification('일정이 추가되었습니다.');
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('빠른 추가 실패:', error);
        showNotification('일정 추가 중 오류가 발생했습니다.');
    }
}

// ==================== 사이드 패널 ====================
function openSidePanel(eventId = null, dateStr = null, title = '', categoryId = null) {
    const form = document.getElementById('eventForm');
    const deleteBtn = document.getElementById('deleteEventBtn');

    form.reset();
    selectedEventId = eventId;

    if (eventId) {
        // 수정 모드
        loadEventToForm(eventId);
        deleteBtn.style.display = 'flex';
    } else {
        // 추가 모드
        const today = dateStr || formatDate(new Date());
        document.getElementById('eventStartDate').value = today;
        if (title) document.getElementById('eventTitle').value = title;
        if (categoryId) document.getElementById('eventCategory').value = categoryId;
        deleteBtn.style.display = 'none';

        // 종일 체크
        document.getElementById('eventStartTime').style.display = 'none';
        document.getElementById('eventEndTime').style.display = 'none';
    }

    // 패널 뷰 전환 (기본 → 편집)
    showEditView();
}

function closeSidePanel() {
    // 임시 이벤트 제거
    if (editingTempEvent) {
        const idx = allEvents.findIndex(e => e.id === editingTempEvent.id);
        if (idx !== -1) {
            allEvents.splice(idx, 1);
            calendar.refetchEvents();
        }
        editingTempEvent = null;
    }

    selectedEventId = null;

    // 패널 뷰 전환 (편집 → 기본)
    showDefaultView();
}

// 패널 뷰 전환 함수
function showEditView() {
    document.getElementById('panelDefaultView').style.display = 'none';
    document.getElementById('panelEditView').style.display = 'flex';
}

function showDefaultView() {
    document.getElementById('panelDefaultView').style.display = 'flex';
    document.getElementById('panelEditView').style.display = 'none';
}

async function loadEventToForm(eventId) {
    const event = allEvents.find(e => e.id == eventId);
    if (!event) return;

    document.getElementById('eventId').value = event.id;
    document.getElementById('eventTitle').value = event.title;
    document.getElementById('eventCategory').value = event.extendedProps.category_id;
    document.getElementById('eventDescription').value = event.extendedProps.description || '';
    document.getElementById('eventAllDay').checked = event.allDay;

    // 반복 일정
    document.getElementById('eventRecurrence').value = event.extendedProps.recurrence_type || '';
    if (event.extendedProps.recurrence_type) {
        document.getElementById('recurrenceOptions').style.display = 'block';
        if (event.extendedProps.recurrence_end_date) {
            document.getElementById('eventRecurrenceEndDate').value = event.extendedProps.recurrence_end_date;
        }
    }

    // 날짜 파싱
    const startDate = event.start.split('T')[0];
    document.getElementById('eventStartDate').value = startDate;

    if (event.end) {
        let endDate = event.end.split('T')[0];
        // FullCalendar는 종일 이벤트의 end를 다음날로 설정하므로 조정
        if (event.allDay) {
            const endDateObj = new Date(endDate);
            endDateObj.setDate(endDateObj.getDate() - 1);
            endDate = formatDate(endDateObj);
        }
        document.getElementById('eventEndDate').value = endDate;
    }

    // 시간
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');

    if (!event.allDay && event.start.includes('T')) {
        const startTime = event.start.split('T')[1].substring(0, 5);
        startTimeInput.value = startTime;
        startTimeInput.style.display = 'block';

        if (event.end && event.end.includes('T')) {
            const endTime = event.end.split('T')[1].substring(0, 5);
            endTimeInput.value = endTime;
            endTimeInput.style.display = 'block';
        }
    } else {
        startTimeInput.style.display = 'none';
        endTimeInput.style.display = 'none';
    }
}

async function saveEvent() {
    const eventId = selectedEventId;
    const title = document.getElementById('eventTitle').value.trim();
    const categoryId = document.getElementById('eventCategory').value;
    const description = document.getElementById('eventDescription').value.trim();
    const allDay = document.getElementById('eventAllDay').checked;
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const recurrenceType = document.getElementById('eventRecurrence').value || null;
    const recurrenceEndDate = document.getElementById('eventRecurrenceEndDate').value || null;

    if (!title || !categoryId || !startDate) {
        showNotification('필수 항목을 입력해주세요.');
        return;
    }

    const eventData = {
        title: title,
        category_id: parseInt(categoryId),
        description: description,
        start_date: startDate,
        end_date: endDate || null,
        all_day: allDay,
        start_time: allDay ? null : startTime,
        end_time: allDay ? null : endTime,
        recurrence_type: recurrenceType,
        recurrence_end_date: recurrenceEndDate
    };

    try {
        let response;
        if (eventId) {
            response = await fetch(`/api/calendar/events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        } else {
            response = await fetch('/api/calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        }

        const data = await response.json();

        if (data.status === 'success') {
            // 임시 이벤트 제거
            if (editingTempEvent) {
                const idx = allEvents.findIndex(e => e.id === editingTempEvent.id);
                if (idx !== -1) {
                    allEvents.splice(idx, 1);
                }
                editingTempEvent = null;
            }

            showNotification(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.');
            closeSidePanel();
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 저장 실패:', error);
        showNotification('일정 저장 중 오류가 발생했습니다.');
    }
}

async function deleteEvent(eventId) {
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('일정이 삭제되었습니다.');
            closeSidePanel();
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        showNotification('일정 삭제 중 오류가 발생했습니다.');
    }
}

async function updateEventDate(eventId, start, end, isAllDay) {
    const eventData = {};

    if (isAllDay === undefined) {
        // allEvents에서 이벤트 찾아서 allDay 정보 가져오기
        const event = allEvents.find(e => e.id == eventId);
        isAllDay = event ? event.allDay : true;
    }

    if (isAllDay) {
        // 종일 이벤트
        eventData.start_date = formatDate(start);
        // FullCalendar는 종일 이벤트의 end를 exclusive로 처리 (다음날 00:00)
        if (end) {
            const endDate = new Date(end);
            endDate.setDate(endDate.getDate() - 1);
            eventData.end_date = formatDate(endDate);
        } else {
            eventData.end_date = null;
        }
        eventData.start_time = null;
        eventData.end_time = null;
        eventData.all_day = true;
    } else {
        // 시간 이벤트
        const startDateTime = new Date(start);
        eventData.start_date = formatDate(startDateTime);
        eventData.start_time = formatTime(startDateTime);

        if (end) {
            const endDateTime = new Date(end);
            eventData.end_date = formatDate(endDateTime);
            eventData.end_time = formatTime(endDateTime);
        } else {
            eventData.end_date = null;
            eventData.end_time = null;
        }
        eventData.all_day = false;
    }

    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            refreshEvents();
            showNotification('일정이 수정되었습니다.');
        } else {
            showNotification('오류: ' + data.message);
            calendar.refetchEvents();
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        showNotification('일정 업데이트 중 오류가 발생했습니다.');
        calendar.refetchEvents();
    }
}

// ==================== 카테고리 모달 ====================
function openCategoryModal() {
    document.getElementById('categoryModalOverlay').classList.add('active');
    document.getElementById('categoryName').focus();
}

function closeCategoryModal() {
    document.getElementById('categoryModalOverlay').classList.remove('active');
    document.getElementById('categoryForm').reset();
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
    document.querySelector('.color-option[data-color="#1976D2"]').classList.add('active');
    document.getElementById('categoryColor').value = '#1976D2';
}

async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();
    const color = document.getElementById('categoryColor').value;

    if (!name) {
        showNotification('카테고리 이름을 입력해주세요.');
        return;
    }

    try {
        const response = await fetch('/api/calendar/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, color: color })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('카테고리가 추가되었습니다.');
            closeCategoryModal();
            loadCategories();
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('카테고리 저장 실패:', error);
        showNotification('카테고리 저장 중 오류가 발생했습니다.');
    }
}

async function deleteCategory(categoryId) {
    if (!confirm('이 카테고리를 삭제하시겠습니까?\n카테고리에 속한 모든 일정도 함께 삭제됩니다.')) {
        return;
    }

    try {
        const response = await fetch(`/api/calendar/categories/${categoryId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('카테고리가 삭제되었습니다.');
            loadCategories();
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message);
        }
    } catch (error) {
        console.error('카테고리 삭제 실패:', error);
        showNotification('카테고리 삭제 중 오류가 발생했습니다.');
    }
}

// ==================== 유틸리티 함수 ====================
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateMainTitle(title) {
    document.getElementById('calendarMainTitle').textContent = title;
}

function refreshEvents() {
    const view = calendar.view;
    loadEventsInRange(view.activeStart, view.activeEnd);
}

function showNotification(message) {
    // 간단한 알림
    alert(message);
}

function showEventPreview(event) {
    // 시스템 이벤트 미리보기
    const desc = event.extendedProps.description || '설명 없음';
    alert(`${event.title}\n\n${desc}`);
}

function formatTime(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// 현재 주 범위 계산 (메인 캘린더 기준)
function getCurrentWeekRange() {
    if (!calendar) return null;

    const view = calendar.view;

    // 주간 뷰인 경우
    if (view.type === 'timeGridWeek') {
        return {
            start: new Date(view.activeStart),
            end: new Date(view.activeEnd)
        };
    }

    // 일간 뷰인 경우 - 해당 날짜가 속한 주 계산
    if (view.type === 'timeGridDay') {
        const currentDate = new Date(view.currentStart);
        const dayOfWeek = currentDate.getDay();

        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        return { start: weekStart, end: weekEnd };
    }

    // 월간 뷰인 경우 - 오늘이 속한 주 계산
    const today = new Date();
    const dayOfWeek = today.getDay();

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { start: weekStart, end: weekEnd };
}

// ==================== 드래그로 일정 생성 (NEW) ====================
function createEventByDrag(start, end, allDay) {
    // 최소 1시간 보장 (시간 뷰에서)
    if (!allDay) {
        const duration = (end - start) / (1000 * 60); // minutes
        if (duration < 60) {
            end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour
        }
    }

    // 임시 이벤트 생성
    const tempEvent = createTempEvent(start, end, allDay);

    // 편집 상태 설정
    editingTempEvent = tempEvent;

    // 패널 즉시 열기
    openSidePanelForEdit(tempEvent);
}

function createTempEvent(start, end, allDay) {
    const tempId = 'temp-' + Date.now();
    const defaultCategory = categories.find(c => !c.is_system);

    const tempEvent = {
        id: tempId,
        title: '제목 없음',
        start: allDay ? formatDate(start) : start.toISOString(),
        end: allDay ? (end ? formatDate(end) : null) : (end ? end.toISOString() : null),
        allDay: allDay,
        backgroundColor: defaultCategory?.color || '#2383e2',
        borderColor: defaultCategory?.color || '#2383e2',
        extendedProps: {
            category_id: defaultCategory?.id,
            description: '',
            is_temp: true // 임시 이벤트 플래그
        }
    };

    // 캘린더에 추가
    allEvents.push(tempEvent);
    calendar.refetchEvents();

    return tempEvent;
}

function openSidePanelForEdit(tempEvent) {
    const form = document.getElementById('eventForm');

    // 폼 리셋
    form.reset();
    selectedEventId = null;

    // 임시 이벤트 데이터로 폼 채우기
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventCategory').value = tempEvent.extendedProps.category_id;

    if (tempEvent.allDay) {
        document.getElementById('eventStartDate').value = tempEvent.start;
        document.getElementById('eventAllDay').checked = true;
        document.getElementById('eventStartTime').style.display = 'none';
        document.getElementById('eventEndTime').style.display = 'none';
    } else {
        const startDateTime = new Date(tempEvent.start);
        document.getElementById('eventStartDate').value = formatDate(startDateTime);
        document.getElementById('eventStartTime').value = formatTime(startDateTime);

        if (tempEvent.end) {
            const endDateTime = new Date(tempEvent.end);
            document.getElementById('eventEndTime').value = formatTime(endDateTime);
        }

        document.getElementById('eventAllDay').checked = false;
        document.getElementById('eventStartTime').style.display = 'block';
        document.getElementById('eventEndTime').style.display = 'block';
    }

    // 삭제 버튼 숨김 (신규 생성이므로)
    document.getElementById('deleteEventBtn').style.display = 'none';

    // 패널 뷰 전환 (기본 → 편집)
    showEditView();

    // 제목 입력에 포커스
    setTimeout(() => {
        const titleInput = document.getElementById('eventTitle');
        titleInput.focus();
        titleInput.select();
    }, 100);
}

// ==================== 실시간 양방향 바인딩 (NEW) ====================
function setupRealtimeBinding() {
    const titleInput = document.getElementById('eventTitle');
    const categorySelect = document.getElementById('eventCategory');
    const startDateInput = document.getElementById('eventStartDate');
    const startTimeInput = document.getElementById('eventStartTime');
    const endTimeInput = document.getElementById('eventEndTime');

    // 제목 실시간 업데이트
    titleInput.addEventListener('input', function() {
        if (editingTempEvent) {
            const event = calendar.getEventById(editingTempEvent.id);
            if (event) {
                event.setProp('title', this.value || '제목 없음');
            }
        }
    });

    // 카테고리 변경 시 색상 업데이트
    categorySelect.addEventListener('change', function() {
        if (editingTempEvent) {
            const category = categories.find(c => c.id == this.value);
            const event = calendar.getEventById(editingTempEvent.id);
            if (event && category) {
                event.setProp('backgroundColor', category.color);
                event.setProp('borderColor', category.color);
                event.setExtendedProp('category_id', category.id);
            }
        }
    });

    // 시간 변경 시 위치 업데이트
    [startDateInput, startTimeInput, endTimeInput].forEach(input => {
        input.addEventListener('change', function() {
            if (editingTempEvent) {
                updateTempEventFromForm();
            }
        });
    });
}

function updateTempEventFromForm() {
    if (!editingTempEvent) return;

    const event = calendar.getEventById(editingTempEvent.id);
    if (!event) return;

    const startDate = document.getElementById('eventStartDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const isAllDay = document.getElementById('eventAllDay').checked;

    if (isAllDay) {
        event.setAllDay(true);
        event.setStart(startDate);
        event.setEnd(null);
    } else {
        event.setAllDay(false);
        const newStart = startTime ? `${startDate}T${startTime}:00` : `${startDate}T09:00:00`;
        const newEnd = endTime ? `${startDate}T${endTime}:00` : null;

        event.setStart(newStart);
        if (newEnd) {
            event.setEnd(newEnd);
        }
    }
}

function updateFormFromTempEvent(event) {
    // 캘린더에서 드래그/리사이즈 시 폼 업데이트
    const startDate = event.start;
    const endDate = event.end;
    const isAllDay = event.allDay;

    document.getElementById('eventStartDate').value = formatDate(startDate);

    if (!isAllDay) {
        document.getElementById('eventStartTime').value = formatTime(startDate);
        if (endDate) {
            document.getElementById('eventEndTime').value = formatTime(endDate);
        }
    }
}

// ==================== 검색 기능 ====================
function filterEventsBySearch(searchTerm) {
    // 캘린더에 표시된 이벤트를 검색어로 필터링
    const filteredEvents = allEvents.filter(event => {
        if (!visibleCategories.has(event.extendedProps.category_id)) {
            return false;
        }

        const title = event.title.toLowerCase();
        const description = (event.extendedProps.description || '').toLowerCase();
        const categoryName = (event.extendedProps.category_name || '').toLowerCase();

        return title.includes(searchTerm) ||
               description.includes(searchTerm) ||
               categoryName.includes(searchTerm);
    });

    // FullCalendar의 이벤트 소스를 업데이트
    calendar.removeAllEvents();
    calendar.addEventSource(filteredEvents);
}
