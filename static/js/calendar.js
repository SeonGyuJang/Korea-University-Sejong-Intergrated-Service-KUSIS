// ==================== 노션 스타일 캘린더 JavaScript (개선 버전) ====================

// 전역 변수
let calendar;
let categories = [];
let allEvents = [];
let visibleCategories = new Set();
let currentMiniCalendarDate = new Date();
let selectedEventId = null;
let previewEventId = null; // 실시간 미리보기용 임시 이벤트 ID

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeCalendar();
    loadCategories();
    renderMiniCalendar();
    setupEventListeners();
    setupKeyboardShortcuts();
    setupSwipeNavigation();
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
        nowIndicator: true,
        slotMinTime: '00:00:00',
        slotMaxTime: '24:00:00',
        slotDuration: '00:30:00', // 30분 단위
        snapDuration: '00:15:00', // 15분 단위로 스냅

        // 드래그 가능한 시간 범위 선택 활성화
        selectConstraint: {
            start: '00:00',
            end: '24:00'
        },

        // 날짜 클릭 (빈 공간 - 종일 이벤트용)
        dateClick: function(info) {
            // 월간 뷰에서만 빠른 추가 모달 표시
            if (calendar.view.type === 'dayGridMonth') {
                showQuickEventModal(info.dateStr);
            }
        },

        // 드래그로 시간 범위 선택 시 (주간/일간 뷰)
        select: function(info) {
            const isAllDay = info.allDay;
            const startDate = info.startStr.split('T')[0];
            const endDate = info.endStr.split('T')[0];

            let startTime = null;
            let endTime = null;

            if (!isAllDay && info.startStr.includes('T')) {
                startTime = info.startStr.split('T')[1].substring(0, 5);
                endTime = info.endStr.split('T')[1].substring(0, 5);
            }

            // 우측 패널 열고 정보 자동 입력
            openSidePanel(null, startDate, '', null, endDate, startTime, endTime, isAllDay);

            // 선택 해제
            calendar.unselect();
        },

        // 이벤트 클릭
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;
            const isPreview = info.event.id === 'preview';

            if (isPreview) {
                return; // 미리보기 이벤트는 클릭 무시
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

            if (isSystem) {
                info.revert();
                showToast('시스템 일정은 이동할 수 없습니다.', 'error');
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end, info.event.allDay);
        },

        // 리사이즈
        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

            if (isSystem) {
                info.revert();
                showToast('시스템 일정은 수정할 수 없습니다.', 'error');
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end, info.event.allDay);
        },

        // 날짜 변경 시
        datesSet: function(info) {
            updateMainTitle(info.view.title);
            loadEventsInRange(info.start, info.end);
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

    // 현재 달 날짜
    const today = new Date();
    for (let day = 1; day <= lastDate; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = date.toDateString() === today.toDateString();
        const hasEvents = allEvents.some(e => e.start.startsWith(dateStr));

        let classes = 'mini-calendar-day';
        if (isToday) classes += ' today';
        if (hasEvents) classes += ' has-events';

        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    // 다음 달 날짜
    const remainingDays = 42 - (firstDay + lastDate);
    for (let day = 1; day <= remainingDays; day++) {
        html += `<div class="mini-calendar-day other-month">${day}</div>`;
    }

    html += '</div>';
    miniCalendar.innerHTML = html;

    // 날짜 클릭 이벤트
    miniCalendar.querySelectorAll('.mini-calendar-day:not(.other-month)').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
            const dateStr = this.dataset.date;
            calendar.gotoDate(dateStr);
        });
    });
}

// ==================== 이벤트 리스너 설정 ====================
function setupEventListeners() {
    // 미니 캘린더 네비게이션
    document.getElementById('miniPrevMonth').addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() - 1);
        renderMiniCalendar();
    });

    document.getElementById('miniNextMonth').addEventListener('click', function() {
        currentMiniCalendarDate.setMonth(currentMiniCalendarDate.getMonth() + 1);
        renderMiniCalendar();
    });

    // 주 네비게이션 버튼
    document.getElementById('prevWeekBtn').addEventListener('click', function() {
        calendar.prev();
    });

    document.getElementById('nextWeekBtn').addEventListener('click', function() {
        calendar.next();
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

        // 실시간 미리보기 업데이트
        updateEventPreview();
    });

    // 반복 일정 선택
    document.getElementById('eventRecurrence').addEventListener('change', function() {
        const hasRecurrence = this.value !== '';
        document.getElementById('recurrenceOptions').style.display = hasRecurrence ? 'block' : 'none';
    });

    // 실시간 미리보기를 위한 입력 필드 변경 감지
    ['eventTitle', 'eventStartDate', 'eventEndDate', 'eventStartTime', 'eventEndTime', 'eventCategory'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', debounce(updateEventPreview, 300));
            element.addEventListener('change', updateEventPreview);
        }
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
        // ESC - 패널/모달 닫기
        if (e.key === 'Escape') {
            closeSidePanel();
            closeCategoryModal();
            closeQuickEventModal();
        }

        // 화살표 좌우 - 주 네비게이션
        if (e.key === 'ArrowLeft' && !isInputFocused()) {
            calendar.prev();
        }
        if (e.key === 'ArrowRight' && !isInputFocused()) {
            calendar.next();
        }

        // T - 오늘로 이동
        if (e.key === 't' && !isInputFocused()) {
            const today = new Date();
            currentMiniCalendarDate = new Date(today);
            calendar.today();
            renderMiniCalendar();
        }
    });
}

// ==================== 스와이프 네비게이션 ====================
function setupSwipeNavigation() {
    const calendarEl = document.getElementById('calendar');
    let touchStartX = 0;
    let touchEndX = 0;

    calendarEl.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    calendarEl.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // 왼쪽으로 스와이프 - 다음 주
                calendar.next();
            } else {
                // 오른쪽으로 스와이프 - 이전 주
                calendar.prev();
            }
        }
    }
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
        showToast('카테고리를 불러오는 중 오류가 발생했습니다.', 'error');
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
        showToast('제목과 카테고리를 입력해주세요.', 'error');
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
            showToast('일정이 추가되었습니다.', 'success');
        } else {
            showToast('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('빠른 추가 실패:', error);
        showToast('일정 추가 중 오류가 발생했습니다.', 'error');
    }
}

// ==================== 사이드 패널 ====================
function openSidePanel(eventId = null, dateStr = null, title = '', categoryId = null, endDateStr = null, startTime = null, endTime = null, isAllDay = true) {
    const panel = document.getElementById('sidePanel');
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
        if (endDateStr) document.getElementById('eventEndDate').value = endDateStr;
        if (title) document.getElementById('eventTitle').value = title;
        if (categoryId) {
            document.getElementById('eventCategory').value = categoryId;
        } else {
            // 첫 번째 사용자 카테고리 선택
            const firstUserCategory = categories.find(cat => !cat.is_system);
            if (firstUserCategory) {
                document.getElementById('eventCategory').value = firstUserCategory.id;
            }
        }

        // 시간 설정
        const allDayCheckbox = document.getElementById('eventAllDay');
        allDayCheckbox.checked = isAllDay;

        if (!isAllDay && startTime && endTime) {
            document.getElementById('eventStartTime').value = startTime;
            document.getElementById('eventEndTime').value = endTime;
            document.getElementById('eventStartTime').style.display = 'block';
            document.getElementById('eventEndTime').style.display = 'block';
        } else {
            document.getElementById('eventStartTime').style.display = 'none';
            document.getElementById('eventEndTime').style.display = 'none';
        }

        deleteBtn.style.display = 'none';

        // 실시간 미리보기 시작
        updateEventPreview();
    }

    panel.classList.add('active');

    // 제목 입력 필드에 포커스
    setTimeout(() => {
        document.getElementById('eventTitle').focus();
    }, 100);
}

function closeSidePanel() {
    document.getElementById('sidePanel').classList.remove('active');
    selectedEventId = null;

    // 미리보기 이벤트 제거
    removeEventPreview();
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
        showToast('필수 항목을 입력해주세요.', 'error');
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
            showToast(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.', 'success');
            closeSidePanel();
            refreshEvents();
        } else {
            showToast('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('일정 저장 실패:', error);
        showToast('일정 저장 중 오류가 발생했습니다.', 'error');
    }
}

async function deleteEvent(eventId) {
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showToast('일정이 삭제되었습니다.', 'success');
            closeSidePanel();
            refreshEvents();
        } else {
            showToast('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        showToast('일정 삭제 중 오류가 발생했습니다.', 'error');
    }
}

async function updateEventDate(eventId, start, end, allDay) {
    const startDate = formatDate(start);
    let endDate = null;
    let startTime = null;
    let endTime = null;

    if (end) {
        if (allDay) {
            // 종일 이벤트: end는 exclusive이므로 1일 빼기
            const endDateObj = new Date(end);
            endDateObj.setDate(endDateObj.getDate() - 1);
            endDate = formatDate(endDateObj);
        } else {
            endDate = formatDate(end);
        }
    }

    // 시간 정보 추출
    if (!allDay) {
        if (start instanceof Date) {
            startTime = start.toTimeString().substring(0, 5);
        }
        if (end instanceof Date) {
            endTime = end.toTimeString().substring(0, 5);
        }
    }

    const eventData = {
        start_date: startDate,
        end_date: endDate,
        all_day: allDay,
        start_time: startTime,
        end_time: endTime
    };

    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            refreshEvents();
            showToast('일정이 이동되었습니다.', 'success');
        } else {
            showToast('오류: ' + data.message, 'error');
            calendar.refetchEvents();
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        showToast('일정 이동 중 오류가 발생했습니다.', 'error');
        calendar.refetchEvents();
    }
}

// ==================== 실시간 미리보기 ====================
function updateEventPreview() {
    // 수정 모드에서는 미리보기 하지 않음
    if (selectedEventId) {
        return;
    }

    const title = document.getElementById('eventTitle').value.trim();
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const startTime = document.getElementById('eventStartTime').value;
    const endTime = document.getElementById('eventEndTime').value;
    const allDay = document.getElementById('eventAllDay').checked;
    const categoryId = document.getElementById('eventCategory').value;

    // 최소한 제목과 시작 날짜가 있어야 미리보기
    if (!title || !startDate) {
        removeEventPreview();
        return;
    }

    // 카테고리 색상 찾기
    const category = categories.find(cat => cat.id == categoryId);
    const color = category ? category.color : '#3788d8';

    // 기존 미리보기 제거
    removeEventPreview();

    // 미리보기 이벤트 생성
    let eventStart = startDate;
    let eventEnd = endDate || startDate;

    if (!allDay && startTime) {
        eventStart = `${startDate}T${startTime}`;
        if (endTime) {
            eventEnd = `${endDate || startDate}T${endTime}`;
        }
    } else if (allDay && endDate) {
        // 종일 이벤트는 exclusive end
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        eventEnd = formatDate(endDateObj);
    }

    const previewEvent = {
        id: 'preview',
        title: title + ' (미리보기)',
        start: eventStart,
        end: eventEnd,
        allDay: allDay,
        backgroundColor: color,
        borderColor: color,
        opacity: 0.6,
        editable: false,
        classNames: ['preview-event']
    };

    calendar.addEvent(previewEvent);
    previewEventId = 'preview';
}

function removeEventPreview() {
    if (previewEventId) {
        const previewEvent = calendar.getEventById(previewEventId);
        if (previewEvent) {
            previewEvent.remove();
        }
        previewEventId = null;
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
        showToast('카테고리 이름을 입력해주세요.', 'error');
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
            showToast('카테고리가 추가되었습니다.', 'success');
            closeCategoryModal();
            loadCategories();
        } else {
            showToast('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('카테고리 저장 실패:', error);
        showToast('카테고리 저장 중 오류가 발생했습니다.', 'error');
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
            showToast('카테고리가 삭제되었습니다.', 'success');
            loadCategories();
            refreshEvents();
        } else {
            showToast('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('카테고리 삭제 실패:', error);
        showToast('카테고리 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// ==================== 토스트 알림 시스템 ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? 'check-circle' :
                 type === 'error' ? 'exclamation-circle' :
                 'info-circle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // 애니메이션
    setTimeout(() => toast.classList.add('show'), 10);

    // 3초 후 제거
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

function showEventPreview(event) {
    // 시스템 이벤트 미리보기
    const desc = event.extendedProps.description || '설명 없음';
    const category = event.extendedProps.category_name || '';
    showToast(`${event.title}\n${category}\n${desc}`, 'info');
}

function isInputFocused() {
    const activeElement = document.activeElement;
    return activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT'
    );
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
