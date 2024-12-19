/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
// GNOME Shell Core Modules
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { PopupSubMenuMenuItem, PopupMenuSection, PopupSeparatorMenuItem} from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js'; 

// GJS Libraries
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

// Extension Specific Modules
import { AsyncHandler, RejectReason } from './asyncHandler.js'; 

// Import constants
import {NORDVPN_CLIENT, NORDVPN_ICON_NAME, MAX_HISTORY_KEY} from './constants.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

/**
 * Execute a command asynchronously and return the output from `stdout` on
 * success or throw an error with output from `stderr` on failure.
 *
 * If given, @input will be passed to `stdin` and @cancellable can be used to
 * stop the process before it finishes.
 *
 * @param {string[]} argv - a list of string arguments
 * @param {string} [input] - Input to write to `stdin` or %null to ignore
 * @param {Gio.Cancellable} [cancellable] - optional cancellable object
 * @returns {Promise<string>} - The process output
 */
async function execCommunicate(argv, input = null, cancellable = null) {
  let cancelId = 0;
  let flags = Gio.SubprocessFlags.STDOUT_PIPE |
              Gio.SubprocessFlags.STDERR_PIPE;

  if (input !== null)
      flags |= Gio.SubprocessFlags.STDIN_PIPE;

  const proc = new Gio.Subprocess({argv, flags});
  proc.init(cancellable);

  if (cancellable instanceof Gio.Cancellable)
      cancelId = cancellable.connect(() => proc.force_exit());

  try {
    const [stdout, stderr] = await proc.communicate_utf8_async(input, null);

    const status = proc.get_exit_status();

    if (status !== 0) {
        throw new Gio.IOErrorEnum({
            code: Gio.IOErrorEnum.FAILED,
            message: stderr ? stderr.trim() : `Command '${argv}' failed with exit code ${status}`,
        });
    }

    return stdout?.trim() ?? '';
  } finally {
      if (cancelId > 0)
          cancellable.disconnect(cancelId);
  }
}

const NordVPNMenuToggle = GObject.registerClass(
  class NordVPNMenuToggle extends QuickMenuToggle {
    constructor(extension) {
      super({
        title: 'NordVPN'
      });

      // init object
      this._path = extension.path;
      this._gicon = this.getGicon(NORDVPN_ICON_NAME);
      this._asyncHandler = new AsyncHandler();
      this._settings = extension.getSettings('nordvpnquicktoggle@wedaxi.com');
      this._history = new Map();

      // setup interface
      this.setHeader();
      this.setCountries();
      this.connect('clicked', () => {
        if (this.checked) {
          this.unCheck();
          execCommunicate([NORDVPN_CLIENT, 'disconnect']);
        } else {
          this.check(this.getGicon(NORDVPN_ICON_NAME));
          execCommunicate([NORDVPN_CLIENT, 'connect'])
            .catch(() => this.unCheck());
        }
      });
      this._settings.connect('changed::' + MAX_HISTORY_KEY, (settings, key) => {
        this.trimHistory();
      });
    }

    setHeader() {
      execCommunicate([NORDVPN_CLIENT, 'version'])
        .then((version) => {
          this.menu.setHeader(
            this.getGicon(NORDVPN_ICON_NAME),
            version.replace('Daemon: ', '')
          );
        })
        .catch(() => {
          this.menu.setHeader(
            this.getGicon(NORDVPN_ICON_NAME),
            _('NordVPN client not found')
          );
        });
    }

    setCountries() {
      execCommunicate([NORDVPN_CLIENT, 'countries'])
        .then((countries) => {
          this._selectCountryMenuItem = new PopupSubMenuMenuItem('', false);
          this._selectCountryMenuItem.menu.addMenuItem(new PopupSeparatorMenuItem(_('Select country')));
          this._selectCountryMenuItem.hide();

          this._lastCountrySection = new PopupMenuSection();

          const regex = countries.includes(',') ? /\,/ : /\r?\n/;
          countries.split(regex).forEach((item) => {
            const country = item.trim();
            this.setCountry(country)
          });

          this.menu.connect('open-state-changed', () => this.onOpenStateChanged());
          this.loadHistory();
          this.menu.addMenuItem(this._selectCountryMenuItem);
        });
    }

    setCountry(country) {
      const gicon = this.getGicon(country);
      this._selectCountryMenuItem.menu.addAction(
        country.replaceAll('_', ' '),
        () => {
          this.check(gicon);
          execCommunicate([NORDVPN_CLIENT, 'connect', country])
            .catch(() => this.unCheck());
          this.handleHistory(country)
        },
        gicon
      );
    }

    handleHistory(country) {
      if (this.getMaxHistorySize()==0) {
        return;
      }

      // first run setup header using separator and map to implement FIFO history
      if(this._history.size == 0) {
        this._lastCountrySection?.addMenuItem(new PopupSeparatorMenuItem(_('Connection history')));
        this._selectCountryMenuItem?.menu.addMenuItem(this._lastCountrySection,0);
      }

      const gicon = this.getGicon(country);

      // if current country is not in history, then process it
      if(!this._history.has(country)) {
        this._lastCountrySection?.addAction(
          country.replaceAll('_', ' '),
          () => {
            this.check(gicon);
            execCommunicate([NORDVPN_CLIENT, 'connect', country])
              .catch(() => this.unCheck());
          },
          gicon
        );
        this._history.set(country,true);

        // implements the FIFO history using a map. giant work around since I can only locate first item in section
        // firstitem.next returns nil, so we pop both the separator header and first country and re-add the header
        if(this._history.size>this.getMaxHistorySize()) {
          let popItem = this._lastCountrySection?.firstMenuItem;
          popItem?.destroy();
          popItem = this._lastCountrySection?.firstMenuItem;
          popItem?.destroy();
          this._lastCountrySection?.addMenuItem(new PopupSeparatorMenuItem(_('Connection history')),0);
          const popKey = this._history.keys().next().value; //get the first key so we push out FIFO
          this._history.delete(popKey);
        }
      }
    }

    trimHistory() {
      let newSize = this.getMaxHistorySize();

      if (this._history.size <= newSize) {
        return;
      }

      this._lastCountrySection?.removeAll();

      if (newSize == 0) {
        this._history.clear();
        return;
      }

      const newMap = new Map();
      const offset = this._history.size - newSize
      const entries = Array.from(this._history.entries());

      for (let i = offset; i < entries.length; i++) {
        const [country, value] = entries[i];
        const gicon = this.getGicon(country);
        newMap.set(country, value);

        this._lastCountrySection?.addAction(
          country,
          () => {
            this.check(gicon);
            execCommunicate([NORDVPN_CLIENT, 'connect', country])
              .catch(() => this.unCheck());
          },
          gicon
        );

        this._history = newMap;
      }
      this._lastCountrySection?.addMenuItem(new PopupSeparatorMenuItem(_('Connection history')),0);
    }

    check(gicon) {
      this.checked = true;
      this._gicon = gicon;
    }

    unCheck() {
      this.checked = false;
      this._gicon = this.getGicon(NORDVPN_ICON_NAME);
    }

    getGicon(icon) {
      const iconPath = GLib.build_filenamev([this._path, 'icons', `${icon}.svg`]);
      const file = Gio.File.new_for_path(iconPath);
      return new Gio.FileIcon({ file });
    }

    onOpenStateChanged() {
      this._asyncHandler.clear();
      if (this.menu.isOpen) {
        this._asyncHandler.when(() => this.menu.box.opacity > 0)
          .then(() => this.openCountriesSubMenu())
          .catch((reason) => {
            if (reason == RejectReason.MAX_NUMBER_OF_TRIES)
              this.openCountriesSubMenu();
          });
      }
    }

    openCountriesSubMenu() {
      if (this.menu.isOpen) {
        this._selectCountryMenuItem.menu.open(false);
      }
    }

    getMaxHistorySize() {
      return this._settings.get_int(MAX_HISTORY_KEY);
    }

    loadHistory() {
      let keys = this._settings.get_value("string-keys").deep_unpack();
      for (let key of keys) {
        this.handleHistory(key);
      }
      this.trimHistory(); //trim the loaded history in case max size has changed
    }

    saveHistory() {
      if (this._history.size < 1) {
        return;
      }
      
      let keys = []; 
      for (const [key, value] of this._history.entries()) {
        keys.push(key);
      }
      this._settings.set_value("string-keys", new GLib.Variant("as", keys))
    }

    destroy() {
      this.saveHistory();
      this._asyncHandler.clear();
      super.destroy();
    }
  });

const NordVPNIndicator = GObject.registerClass(
  class NordVPNIndicator extends SystemIndicator {
    constructor(extension) {
      super();

      this._indicator = this._addIndicator();

      const toggle = new NordVPNMenuToggle(extension);
      toggle.bind_property('checked',
        this._indicator, 'visible',
        GObject.BindingFlags.SYNC_CREATE);
      toggle.bind_property('gicon',
        this._indicator, 'gicon',
        GObject.BindingFlags.SYNC_CREATE);
      this.quickSettingsItems.push(toggle);
    }
  });

export default class QuickSettingsNordVPNExtension extends Extension {
  enable() {
    this._indicator = new NordVPNIndicator(this);
    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
  }

  disable() {
    this._indicator.quickSettingsItems.forEach(item => item.destroy());
    this._indicator.destroy();
    this._indicator = null;
  }
}
