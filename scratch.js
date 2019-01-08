var Extension = imports.misc.extensionUtils.extensions['paperwm@hedning:matrix.org'];
var Meta = imports.gi.Meta;
var Main = imports.ui.main;

var TopBar = Extension.imports.topbar;
var Tiling = Extension.imports.tiling;
var utils = Extension.imports.utils;
var debug = utils.debug;
var float, scratchFrame; // symbols used for expando properties on metawindow


function focusMonitor() {
    if (global.display.focus_window) {
        return Main.layoutManager.monitors[global.display.focus_window.get_monitor()]
    } else {
        return Main.layoutManager.primaryMonitor;
    }
}

/**
   Tween window to "frame-coordinate" (targetX, targetY).
   The frame is moved once the tween is done.

   The actual window actor (not clone) is tweened to ensure it's on top of the
   other windows/clones (clones if the space animates)
 */
function tweenScratch(metaWindow, targetX, targetY, tweenParams={}) {
    let Tweener = imports.ui.tweener;
    let Settings = Extension.imports.settings;
    let f = metaWindow.get_frame_rect();
    let b = metaWindow.get_buffer_rect();
    let dx = f.x - b.x;
    let dy = f.y - b.y;

    Tweener.addTween(metaWindow.get_compositor_private(), Object.assign(
        {
            time: Settings.prefs.animation_time,
            transition: 'easeInOutQuad',
            x: targetX - dx,
            y: targetY - dy,
        },
        tweenParams,
        {
            onComplete: function(...args) {
                metaWindow.move_frame(true, targetX , targetY);
                tweenParams.onComplete && tweenParams.onComplete.apply(this, args);
            }
        }));
}

function makeScratch(metaWindow) {
    let fromNonScratch = !metaWindow[float];
    let fromTiling = false;
    if (fromNonScratch) {
        let space = Tiling.spaces.spaceOfWindow(metaWindow);
        fromTiling = space.indexOf(metaWindow) > -1;
    }

    metaWindow[float] = true;
    metaWindow.make_above();
    metaWindow.stick();

    if (!metaWindow.minimized)
        Tiling.showWindow(metaWindow);

    if (fromTiling) {
        let f = metaWindow.get_frame_rect();
        let targetFrame = null;

        if (metaWindow[scratchFrame]) {
            let sf = metaWindow[scratchFrame];
            if (utils.monitorOfPoint(sf.x, sf.y)) {
                targetFrame = sf;
            }
        }

        if (!targetFrame) {
            // Default to moving the window slightly down and reducing the height
            let vDisplacement = 30;
            targetFrame = new Meta.Rectangle({
                x: f.x, y: f.y + vDisplacement,
                width: f.width,
                height: Math.min(f.height - vDisplacement, Math.floor(f.height * 0.9))
            })
        }

        metaWindow.move_resize_frame(true, f.x, f.y, targetFrame.width, targetFrame.height);
        tweenScratch(metaWindow, targetFrame.x, targetFrame.y,
                     {onComplete: () => delete metaWindow[scratchFrame]});
    }

    let monitor = focusMonitor();
    if (monitor.clickOverlay)
        monitor.clickOverlay.hide();
}

function unmakeScratch(metaWindow) {
    if (!metaWindow[scratchFrame])
        metaWindow[scratchFrame] = metaWindow.get_frame_rect();
    metaWindow[float] = false;
    metaWindow.unmake_above();
    metaWindow.unstick();
}

function toggle(metaWindow) {
    if (isScratchWindow(metaWindow)) {
        unmakeScratch(metaWindow);
        hide();
    } else {
        makeScratch(metaWindow);

        if (metaWindow.has_focus) {
            let space = Tiling.spaces.get(global.workspace_manager.get_active_workspace());
            space.setSelectionInactive();
        }
    }
}

function isScratchWindow(metaWindow) {
    return metaWindow && metaWindow[float];
}

/** Return scratch windows in MRU order */
function getScratchWindows() {
    return global.display.get_tab_list(Meta.TabList.NORMAL, null)
        .filter(isScratchWindow);
}

function isScratchActive() {
    return getScratchWindows().some(metaWindow => !metaWindow.minimized);
}

function toggleScratch() {
    if (isScratchActive())
        hide();
    else
        show();
}

function toggleScratchWindow() {
    if (isScratchActive())
        hide();
    else
        show(true);
}

function show(top) {
    let windows = getScratchWindows();
    if (windows.length === 0) {
        return;
    }
    if (top)
        windows = windows.slice(0,1);

    TopBar.show();

    windows.slice().reverse()
        .map(function(meta_window) {
            meta_window.unminimize();
            meta_window.make_above();
            meta_window.get_compositor_private().show();
    });
    windows[0].activate(global.get_current_time());

    let monitor = focusMonitor();
    if (monitor.clickOverlay)
        monitor.clickOverlay.hide();
}

function hide() {
    let windows = getScratchWindows();
    windows.map(function(meta_window) {
        meta_window.minimize();
    });
}

// Monkey patch the alt-space menu
var Lang = imports.lang;
var PopupMenu = imports.ui.popupMenu;
var WindowMenu = imports.ui.windowMenu;
var originalBuildMenu = WindowMenu.WindowMenu.prototype._buildMenu;

function init() {
    float = Symbol();
    scratchFrame = Symbol();
}

function enable() {
    WindowMenu.WindowMenu.prototype._buildMenu =
        function (window) {
            let item;
            item = this.addAction(_('Scratch'), () => {
                toggle(window);
            });
            if (isScratchWindow(window))
                item.setOrnament(PopupMenu.Ornament.CHECK);

            originalBuildMenu.call(this, window);
        };
}

function disable() {
    WindowMenu.WindowMenu.prototype._buildMenu = originalBuildMenu;
}
