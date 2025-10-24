// ==================== 노션 스타일 캘린더 JavaScript ====================

// 전역 변수
let calendar;
let categories = [];
let allEvents = [];
let visibleCategories = new Set();
let currentMiniCalendarDate = new Date();
let selectedEventId = null;

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
        nowIndicator: true, // 현재 시간 표시
        slotMinTime: '00:00:00',
        slotMaxTime: '24:00:00',

        // 날짜 클릭 (빈 공간)
        dateClick: function(info) {
            showQuickEventModal(info.dateStr);
        },

        // 이벤트 클릭
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

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
                showNotification('시스템 일정은 이동할 수 없습니다.');
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
        },

        // 리사이즈
        eventResize: function(info) {
            const eventId = info.event.id;
            const isSystem = info.event.extendedProps.is_system;

            if (isSystem) {
                info.revert();
                showNotification('시스템 일정은 수정할 수 없습니다.');
                return;
            }

            updateEventDate(eventId, info.event.start, info.event.end);
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
    });

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
        // ESC - 패널/모달 닫기
        if (e.key === 'Escape') {
            closeSidePanel();
            closeCategoryModal();
            closeQuickEventModal();
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
        if (title) document.getElementById('eventTitle').value = title;
        if (categoryId) document.getElementById('eventCategory').value = categoryId;
        deleteBtn.style.display = 'none';

        // 종일 체크
        document.getElementById('eventStartTime').style.display = 'none';
        document.getElementById('eventEndTime').style.display = 'none';
    }

    panel.classList.add('active');
}

function closeSidePanel() {
    document.getElementById('sidePanel').classList.remove('active');
    selectedEventId = null;
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

async function updateEventDate(eventId, start, end) {
    const startDate = formatDate(start);
    const endDate = end ? formatDate(end) : null;

    const eventData = {
        start_date: startDate,
        end_date: endDate
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
        } else {
            showNotification('오류: ' + data.message);
            calendar.refetchEvents();
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
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
