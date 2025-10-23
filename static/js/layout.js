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

    // 카테고리별 아이콘 매핑 (예시)
    const categoryIcons = {
        '공지': 'fas fa-bullhorn',
        '홍보': 'fas fa-ad',
        '안내': 'fas fa-info-circle',
        '업데이트': 'fas fa-sync-alt',
        '일반': 'fas fa-comment-alt' // 기본 아이콘
    };

    // 알림 데이터 로드 함수
    async function loadNotifications() {
        // 요구사항 1: noticeListUl, notificationBadge 요소 존재 여부와 관계없이 항상 호출 가능하도록 수정
        // if (!noticeListUl || !notificationBadge) return; // 이 조건 제거

        try {
            const response = await fetch('/api/notifications');
            if (!response.ok) throw new Error('알림 로드 실패');
            const data = await response.json();

            if (data.status === 'success') {
                const notices = data.notifications || [];
                const noticeCount = data.count || 0; // API에서 받은 실제 개수 사용

                // 요구사항 1 & 2: 뱃지 카운트 업데이트 및 표시 (모든 페이지에서)
                if (notificationBadge) { // 뱃지 요소가 있을 때만 업데이트
                    if (noticeCount > 0) {
                        notificationBadge.textContent = noticeCount;
                        notificationBadge.style.display = 'flex'; // 보이도록 설정
                    } else {
                        notificationBadge.style.display = 'none'; // 숨김
                    }
                }

                // 알림 드롭다운 내용 업데이트 (드롭다운 요소가 있을 때만)
                if (noticeListUl) {
                    noticeListUl.innerHTML = ''; // 기존 목록 비우기
                    if (notices.length > 0) {
                        notices.forEach(notice => {
                            const li = document.createElement('li');
                            // 요구사항 2: 카테고리 아이콘 추가
                            const iconClass = categoryIcons[notice.category] || categoryIcons['일반'];
                            li.innerHTML = `
                                <a href="/post/${notice.id}" class="notification-link">
                                    <i class="${iconClass}" style="margin-right: 8px; color: var(--korea-red-light);"></i>
                                    ${notice.title}
                                </a>`;
                            noticeListUl.appendChild(li);
                        });
                    } else {
                        noticeListUl.innerHTML = '<li>새로운 공지사항이 없습니다.</li>';
                    }
                }
            } else {
                throw new Error(data.message || '알림 데이터 로드 실패');
            }
        } catch (error) {
            console.error('알림 로드 중 오류:', error);
            if (noticeListUl) noticeListUl.innerHTML = '<li>알림을 불러오는데 실패했습니다.</li>';
            if (notificationBadge) notificationBadge.style.display = 'none'; // 오류 시 뱃지 숨김
        }
    }

    if (notificationToggle && notificationDropdown) {
        notificationToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = notificationDropdown.classList.toggle('active');
            if (isActive) {
                loadNotifications(); // 드롭다운 열릴 때 다시 로드
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
    // 요구사항 1: 로그인 여부와 관계없이 항상 호출하여 뱃지 상태 업데이트 시도
    loadNotifications();
    // 주기적으로 알림 상태 업데이트 (예: 1분마다)
    setInterval(loadNotifications, 60000); // 60000ms = 1분


    // --- 도서관 검색 기능 (기존 유지) ---
    // ... (기존 코드 유지) ...
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
    // ... (기존 코드 유지) ...
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const linkUrl = e.currentTarget.getAttribute('href');
            const dataUrl = e.currentTarget.dataset.url;
            if (linkUrl && linkUrl !== '#' && !dataUrl) return; // 내부 링크는 기본 동작 따름
            if (dataUrl) { // 외부 링크만 처리
                e.preventDefault();
                if (loadingText) loadingText.textContent = '이동 중입니다... 새로운 탭에서 열립니다.';
                if (loadingOverlay) loadingOverlay.classList.add('active');
                setTimeout(() => {
                    window.open(dataUrl, '_blank');
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                }, 1500);
            }
        });
    });


    // --- 알림 링크 클릭 이벤트 위임 (기존 유지) ---
    if (notificationDropdown) {
        notificationDropdown.addEventListener('click', (e) => {
            const link = e.target.closest('.notification-link');
            if (link) {
                notificationDropdown.classList.remove('active');
            }
        });
    }

}); // DOMContentLoaded end