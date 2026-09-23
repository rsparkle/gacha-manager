<template>
    <footer class="app-footer">
        <div class="footer-inner">
            <p class="footer-main">
                This is a non-commercial, unofficial, fan-made gacha companion app and is not affiliated with, endorsed by, or
                associated with any of the game publishers listed below.
            </p>
            <p class="footer-owners">
                All game assets, characters, names, and trademarks belong to their respective owners -
                <span class="footer-company">HoYoverse</span>,
                <span class="footer-company">Paper Games</span>,
                <span class="footer-company">Perfect World Games (Hotta Studio)</span>,
                and all other rights holders.
            </p>
        </div>
    </footer>
</template>

<script setup>
</script>

<style scoped>
.app-footer {
    width: 100%;
    padding: 20px 0 16px;
    border-top: 1px solid var(--border);
    background: linear-gradient(to top, rgba(0, 0, 0, 0.25), transparent);
    margin-top: auto;
}

.footer-inner {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    text-align: center;
}

.footer-main {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.6;
    margin: 0;
}

.footer-owners {
    font-size: 11px;
    color: var(--muted);
    margin: 0;
    line-height: 1.6;
}

.footer-company {
    color: var(--muted2);
    font-weight: 600;
}

.footer-copy {
    font-size: 10px;
    color: var(--muted);
    margin: 4px 0 0;
    letter-spacing: 0.03em;
    opacity: 0.7;
}
</style>