document.addEventListener('DOMContentLoaded', () => {
    // --- 사이드바 토글 기능 (기존 유지) ---
    const leftSidebarToggle = document.getElementById('leftSidebarToggle');
    const sidebarLeft = document.getElementById('sidebarLeft');
    if (leftSidebarToggle && sidebarLeft) {
        leftSidebarToggle.addEventListener('click', () => {
            sidebarLeft.classList.toggle('collapsed');
        });
    }

    // --- 알림 드롭다운 Logic 수정 ---
    const notificationToggle = document.getElementById('notificationToggle');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const noticeListUl = document.getElementById('noticeList');
    const notificationBadge = document.getElementById('notificationBadge');

    // 알림 데이터 로드 함수 (Req 1, 2)
    async function loadNotifications() {
        if (!noticeListUl || !notificationBadge) return;
        try {
            const response = await fetch('/api/notifications');
            if (!response.ok) throw new Error('알림 로드 실패');
            const data = await response.json();

            if (data.status === 'success') {
                noticeListUl.innerHTML = ''; // 기존 목록 비우기
                const notices = data.notifications || [];
                const noticeCount = data.count || 0; // API에서 받은 실제 개수 사용 (Req 2)

                if (notices.length > 0) {
                    notices.forEach(notice => {
                        const li = document.createElement('li');
                        // Req 1: 제목을 클릭 가능한 링크로 만듦
                        li.innerHTML = `<a href="/post/${notice.id}" class="notification-link">${notice.title}</a>`;
                        noticeListUl.appendChild(li);
                    });
                    // Req 2: 뱃지 카운트 업데이트 및 표시
                    notificationBadge.textContent = noticeCount;
                    notificationBadge.style.display = 'flex'; // 보이도록 설정
                } else {
                    noticeListUl.innerHTML = '<li>새로운 공지사항이 없습니다.</li>';
                    notificationBadge.style.display = 'none'; // 숨김
                }

                // Req 2: 알림 팝업의 공지사항 개수와 뱃지 개수 일치 (API에서 count를 주므로 별도 로직 불필요)

            } else {
                throw new Error(data.message || '알림 데이터 로드 실패');
            }
        } catch (error) {
            console.error('알림 로드 중 오류:', error);
            if (noticeListUl) noticeListUl.innerHTML = '<li>알림을 불러오는데 실패했습니다.</li>';
            if (notificationBadge) notificationBadge.style.display = 'none';
        }
    }

    if (notificationToggle && notificationDropdown) {
        notificationToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from propagating to document
            const isActive = notificationDropdown.classList.toggle('active');
            // 드롭다운 열릴 때 알림 로드 (선택사항: 주기적으로 로드해도 됨)
            if (isActive) {
                loadNotifications();
            }
        });

        // --- 알림 위젯 내부 탭 Logic (기존 유지) ---
        const tabs = notificationDropdown.querySelectorAll('.notification-tabs .tab');
        const contents = notificationDropdown.querySelectorAll('.notification-content .tab-content');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const targetId = e.currentTarget.dataset.tab;
                contents.forEach(c => c.classList.toggle('active', c.id === targetId));
            });
        });
    }

    // 다른 곳 클릭 시 알림 드롭다운 닫기 (기존 유지)
    document.addEventListener('click', (e) => {
        if (notificationDropdown && notificationDropdown.classList.contains('active')) {
            if (!notificationDropdown.contains(e.target) && !notificationToggle.contains(e.target)) {
                notificationDropdown.classList.remove('active');
            }
        }
    });

    // --- 페이지 로드 시 초기 알림 로드 (뱃지 업데이트 위해) ---
    // 로그인 상태 확인 후 로드 (선택 사항: 비로그인 시에도 로드할지 결정)
    if (document.querySelector('.profile-widget .profile-name')) { // 예시: 프로필 이름 요소로 로그인 상태 추정
       loadNotifications();
    }


    // --- 도서관 검색 기능 (기존 유지) ---
    const librarySearchInput = document.getElementById('librarySearchInput');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    if (librarySearchInput) {
        librarySearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const searchQuery = librarySearchInput.value.trim();
                if (searchQuery) {
                    if (loadingText) loadingText.textContent = `검색하신 키워드로 고려대학교 도서관 사이트로 이동합니다.`;
                    if (loadingOverlay) loadingOverlay.classList.add('active');
                    setTimeout(() => {
                        const libraryUrl = `https://library.korea.ac.kr/main-search-result/?q=${encodeURIComponent(searchQuery)}`;
                        window.open(libraryUrl, '_blank');
                        if (loadingOverlay) loadingOverlay.classList.remove('active');
                        if (loadingText) loadingText.textContent = '이동 중입니다... 새로운 탭에서 열립니다.';
                        librarySearchInput.value = '';
                    }, 1500);
                }
            }
        });
        const searchIcon = librarySearchInput.parentElement?.querySelector('.fa-search');
        if (searchIcon) {
            searchIcon.style.cursor = 'pointer';
            searchIcon.addEventListener('click', () => {
                const searchQuery = librarySearchInput.value.trim();
                if (searchQuery) librarySearchInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
            });
        }
    }

    // --- 네비게이션 메뉴 클릭 (외부 링크 애니메이션 - 기존 유지) ---
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const linkUrl = e.currentTarget.getAttribute('href');
            const dataUrl = e.currentTarget.dataset.url;
            if (linkUrl && linkUrl !== '#' && !dataUrl) return;
            e.preventDefault();
            if (dataUrl) {
                if (loadingText) loadingText.textContent = '이동 중입니다... 새로운 탭에서 열립니다.';
                if (loadingOverlay) loadingOverlay.classList.add('active');
                setTimeout(() => {
                    window.open(dataUrl, '_blank');
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                }, 1500);
            }
        });
    });

    // --- 신규: 알림 링크 클릭 이벤트 위임 (Req 1) ---
    // 드롭다운 내부에 동적으로 생성되는 링크를 처리하기 위해 이벤트 위임 사용
    if (notificationDropdown) {
        notificationDropdown.addEventListener('click', (e) => {
            const link = e.target.closest('.notification-link');
            if (link) {
                // 기본 링크 동작을 막지 않음 (새 탭에서 열리도록 하려면 추가 로직 필요)
                // 드롭다운 닫기
                notificationDropdown.classList.remove('active');
            }
        });
    }

}); // DOMContentLoaded end