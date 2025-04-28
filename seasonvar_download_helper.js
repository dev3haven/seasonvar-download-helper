// ==UserScript==
// @name         Seasonvar Download Helper
// @name:en Seasonvar Download Helper
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Добавляет кнопки для скачивания видео и плейлиста с невидимым переключением
// @description:en  Adds download file and playlist buttons
// @author       Your Name
// @match        *://seasonvar.ru/*
// @grant        GM.cookie
// @grant        GM.openInTab
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @connect      seasonvar.ru
// @run-at       document-end
// ==/UserScript==
(() => {
    'use strict';
    let logWindow = null;
    let originalActiveItem = null;

    const createDownloadButton = () => {
        new MutationObserver((_, observer) => {
            const video = document.querySelector('video');
            if (!video?.src) return;

            const container = document.querySelector('#oframehtmlPlayer');
            if (!container || container.querySelector('#video-download-btn')) return;

            const a = document.createElement('a');
            a.id = 'video-download-btn';
            a.textContent = 'Download';
            a.style.cssText = 'position:absolute;z-index:9999;color:white;cursor:pointer;padding:5px;background:red;';
            a.href = video.src;
            a.download = true;
            container.appendChild(a);
            observer.disconnect();
        }).observe(document.body, {subtree: true, childList: true});
    };

    const switchPlaylistItem = async (index) => {
        const items = document.querySelectorAll('#htmlPlayer_playlist > *');
        originalActiveItem = document.querySelector('#htmlPlayer_playlist > .current');

        return new Promise(resolve => {
            const observer = new MutationObserver((_, obs) => {
                const video = document.querySelector('video[src]');
                if (video?.src && !video.src.includes('undefined')) {
                    obs.disconnect();
                    resolve(video.src);
                }
            });

            observer.observe(document.body, {subtree: true, childList: true});
            items[index].click();
        });
    };

    const restoreOriginalState = () => {
        if (originalActiveItem) {
            originalActiveItem.click();
            originalActiveItem = null;
        }
    };

    const generateAriaCommands = async (urls) => {
        const cookieList = await GM.cookie.list({domain: 'seasonvar.ru'});
        const cookies = cookieList.map(c => `${c.name}=${c.value}`).join('; ');

        const commandPrefix = 'aria2 -j1 -x4 -s4 -c -m0';
        const commands = urls
            .map(url => `${commandPrefix} "${url}" --header="Referer: ${location.href}" --header="Cookie: ${cookies}"`);
        const oneCommand = `${commandPrefix} --header="Referer: ${location.href}" --header="Cookie: ${cookies}" -Z `
            + urls.join(' ');

        const winBatch = [
            '@echo off',
            'chcp 65001',
            ...commands.map(c => `start /B cmd /c "${c}"`),
            'exit'
        ].join('\n');

        const linuxScript = [
            '#!/bin/bash',
            ...commands.map(c => `${c} &`),
            'exit 0'
        ].join('\n');

        const winBatchOneCommand = [
            '@echo off',
            'chcp 65001',
            oneCommand,
            'exit'
        ].join('\n');

        const linuxBatchOneCommand = [
            '#!/bin/bash',
            oneCommand,
            'exit 0'
        ].join('\n');

        return {commands, winBatch, linuxScript, winBatchOneCommand, linuxBatchOneCommand};
    };

    const createPlaylistDownloader = () => {
        const btn = document.createElement('button');
        btn.textContent = 'Скачать плейлист';
        btn.style.cssText = 'position:fixed;top:30px;right:10px;z-index:9999;';
        document.body.appendChild(btn);

        btn.addEventListener('click', async () => {
            logWindow = window.open('', '_blank');
            logWindow.document.write('<pre>Инициализация скачивания плейлиста...</pre>');

            const playerContainer = document.querySelector('#oframehtmlPlayer');
            const video = document.querySelector('video');
            if (!playerContainer || !video) {
                logWindow.document.body.innerHTML += '<br>Ошибка: не найден плеер или видео';
                return;
            }

            const originalDisplay = playerContainer.style.display;
            const originalMuted = video.muted;
            const originalPaused = video.paused;

            playerContainer.style.display = 'none';
            video.muted = true;
            if (!video.paused) video.pause();

            try {
                const items = document.querySelectorAll('#htmlPlayer_playlist > *');
                const results = [];

                for (let i = 0; i < items.length; i++) {
                    try {
                        logWindow.document.body.innerHTML += `<br>Обрабатываю элемент ${i + 1}/${items.length}`;
                        const src = await Promise.race([
                            switchPlaylistItem(i),
                            new Promise((_, r) => setTimeout(() => r(null), 25000))
                        ]);

                        if (src) {
                            results.push(src);
                            logWindow.document.body.innerHTML += `<br>[${i + 1}/${items.length}] Получена ссылка: ${src}`;
                        }
                        restoreOriginalState();
                        await new Promise(r => setTimeout(r, 4000));
                    } catch (e) {
                        logWindow.document.body.innerHTML += `<br>Ошибка: ${e.message}`;
                    }
                }

                const {
                    commands, winBatch, linuxScript,
                    winBatchOneCommand, linuxBatchOneCommand
                } = await generateAriaCommands(results);
                logWindow.document.body.innerHTML = `
                    <pre>${commands.join('<br>')}

                    === Windows batch ===<br>
                    ${winBatch.replace(/\n/g, '<br>')}
                    
                    === Windows batch by one command ===<br>
                    ${winBatchOneCommand.replace(/\n/g, '<br>')}

                    === Linux script ===<br>
                    ${linuxScript.replace(/\n/g, '<br>')}
                    
                    === Linux script by one command ===<br>
                    ${linuxBatchOneCommand.replace(/\n/g, '<br>')}
                    </pre>`;
            } catch (e) {
                logWindow.document.body.innerHTML += `<br>Критическая ошибка: ${e.message}`;
            } finally {
                playerContainer.style.display = originalDisplay;
                video.muted = originalMuted;
                if (!originalPaused) video.play().catch(() => {
                });
            }
        });
    };

    window.addEventListener('load', () => {
        createDownloadButton();
        createPlaylistDownloader();
    }, {once: true});
})();
