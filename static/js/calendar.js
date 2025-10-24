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
        initialView: 'dayGridMonth',
        locale: 'ko',
        headerToolbar: false, // 커스텀 툴바 사용
        editable: true,
        selectable: true,
        selectMirror: true,
        dayMaxEvents: 3,
        weekends: true,
        height: 'auto',

        // 날짜 클릭 (빈 공간)
        dateClick: function(info) {
            showQuickAddPopup(info.jsEvent, info.dateStr);
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
                showNotification('시스템 일정은 이동할 수 없습니다.', 'warning');
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
                showNotification('시스템 일정은 수정할 수 없습니다.', 'warning');
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

    // 빠른 추가 폼
    document.getElementById('quickAddForm').addEventListener('submit', function(e) {
        e.preventDefault();
        quickAddEvent();
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
}

// ==================== 키보드 단축키 ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // ESC - 패널/모달 닫기
        if (e.key === 'Escape') {
            closeSidePanel();
            closeCategoryModal();
            hideQuickAddPopup();
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
        showNotification('카테고리를 불러오는 중 오류가 발생했습니다.', 'error');
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
    const select = document.getElementById('eventCategory');
    select.innerHTML = '';

    categories.filter(cat => !cat.is_system).forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
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

// ==================== 사이드 패널 ====================
function openSidePanel(eventId = null) {
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
        const today = formatDate(new Date());
        document.getElementById('eventStartDate').value = today;
        deleteBtn.style.display = 'none';
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

    if (!title || !categoryId || !startDate) {
        showNotification('필수 항목을 입력해주세요.', 'warning');
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
        end_time: allDay ? null : endTime
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
            showNotification(eventId ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.', 'success');
            closeSidePanel();
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('일정 저장 실패:', error);
        showNotification('일정 저장 중 오류가 발생했습니다.', 'error');
    }
}

async function deleteEvent(eventId) {
    try {
        const response = await fetch(`/api/calendar/events/${eventId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            showNotification('일정이 삭제되었습니다.', 'success');
            closeSidePanel();
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        showNotification('일정 삭제 중 오류가 발생했습니다.', 'error');
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
            showNotification('오류: ' + data.message, 'error');
            calendar.refetchEvents();
        }
    } catch (error) {
        console.error('일정 업데이트 실패:', error);
        calendar.refetchEvents();
    }
}

// ==================== 빠른 일정 추가 ====================
function showQuickAddPopup(event, dateStr) {
    const popup = document.getElementById('quickAddPopup');
    const input = document.getElementById('quickEventTitle');

    popup.style.left = `${event.pageX}px`;
    popup.style.top = `${event.pageY}px`;
    popup.classList.add('active');

    document.getElementById('quickEventDate').value = dateStr;
    input.value = '';
    input.focus();
}

function hideQuickAddPopup() {
    document.getElementById('quickAddPopup').classList.remove('active');
}

async function quickAddEvent() {
    const title = document.getElementById('quickEventTitle').value.trim();
    const dateStr = document.getElementById('quickEventDate').value;

    if (!title) return;

    // 첫 번째 사용자 카테고리 사용
    const userCategory = categories.find(cat => !cat.is_system);
    if (!userCategory) {
        showNotification('카테고리를 먼저 추가해주세요.', 'warning');
        return;
    }

    const eventData = {
        title: title,
        category_id: userCategory.id,
        description: '',
        start_date: dateStr,
        end_date: null,
        all_day: true,
        start_time: null,
        end_time: null
    };

    try {
        const response = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            hideQuickAddPopup();
            refreshEvents();
            showNotification('일정이 추가되었습니다.', 'success');
        } else {
            showNotification('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('빠른 추가 실패:', error);
        showNotification('일정 추가 중 오류가 발생했습니다.', 'error');
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
        showNotification('카테고리 이름을 입력해주세요.', 'warning');
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
            showNotification('카테고리가 추가되었습니다.', 'success');
            closeCategoryModal();
            loadCategories();
        } else {
            showNotification('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('카테고리 저장 실패:', error);
        showNotification('카테고리 저장 중 오류가 발생했습니다.', 'error');
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
            showNotification('카테고리가 삭제되었습니다.', 'success');
            loadCategories();
            refreshEvents();
        } else {
            showNotification('오류: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('카테고리 삭제 실패:', error);
        showNotification('카테고리 삭제 중 오류가 발생했습니다.', 'error');
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

function showNotification(message, type = 'info') {
    // 간단한 알림 (나중에 Toast UI로 개선 가능)
    console.log(`[${type.toUpperCase()}] ${message}`);
    alert(message);
}

function showEventPreview(event) {
    // 시스템 이벤트 미리보기 (간단한 alert, 나중에 툴팁으로 개선 가능)
    alert(`${event.title}\n\n${event.extendedProps.description || '설명 없음'}`);
}
