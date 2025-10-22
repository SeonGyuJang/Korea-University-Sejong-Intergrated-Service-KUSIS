document.addEventListener('DOMContentLoaded', () => {
    // --- 사이드바 토글 기능 ---
    const leftSidebarToggle = document.getElementById('leftSidebarToggle');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    const sidebarLeft = document.getElementById('sidebarLeft');
    const sidebarRight = document.getElementById('sidebarRight');

    if (leftSidebarToggle && sidebarLeft) {
        leftSidebarToggle.addEventListener('click', () => {
            sidebarLeft.classList.toggle('collapsed');
        });
    }

    if (rightSidebarToggle && sidebarRight) {
        rightSidebarToggle.addEventListener('click', () => {
            sidebarRight.classList.toggle('expanded');
        });
    }

    // --- 알림 드롭다운 Logic (기존 유지) ---
    const notificationToggle = document.getElementById('notificationToggle');
    const notificationDropdown = document.getElementById('notificationDropdown');

    if (notificationToggle && notificationDropdown) {
        notificationToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from propagating to document
            notificationDropdown.classList.toggle('active');
        });

        // --- 알림 위젯 내부 탭 Logic ---
        const tabs = notificationDropdown.querySelectorAll('.notification-tabs .tab');
        const contents = notificationDropdown.querySelectorAll('.notification-content .tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // 탭 활성화 상태 변경
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // 컨텐츠 표시 상태 변경
                const targetId = e.currentTarget.dataset.tab;
                contents.forEach(c => {
                    if (c.id === targetId) {
                        c.classList.add('active');
                    } else {
                        c.classList.remove('active');
                    }
                });
            });
        });
    }

    // 다른 곳 클릭 시 알림 드롭다운 닫기
    document.addEventListener('click', (e) => {
        if (notificationDropdown && notificationDropdown.classList.contains('active')) {
            // 드롭다운 자신이나 토글 버튼이 아니면 닫기
            if (!notificationDropdown.contains(e.target) && !notificationToggle.contains(e.target)) {
                notificationDropdown.classList.remove('active');
            }
        }
    });
    // --- 알림 로직 종료 ---
});