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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { PopupSubMenuMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { spawnCommandLine } from 'resource:///org/gnome/shell/misc/util.js';

const CONNECT = "nordvpn connect";
const DISCONNECT = "nordvpn disconnect";
const COUNTRIES = "nordvpn countries";
const ICON_NAME = "nordvpn-tray-white";

function getGioIcon(icon) {
  const ext = Extension.lookupByURL(import.meta.url)
  const file = ext.dir.resolve_relative_path(`icons/${icon}.svg`);
  return new Gio.FileIcon({ file });
}

function spawnCommandLineSync(commandLine, def = "") {
    try {
      const [success_, argv] = GLib.shell_parse_argv(commandLine);
      const launchContext = Shell.Global.get().create_app_launch_context(0, -1);
      const [ok, standard_output, standard_error_, wait_status_] = GLib.spawn_sync(
        null,
        argv,
        launchContext.get_environment(),
        GLib.SpawnFlags.SEARCH_PATH,
        () => {}
      );
      if (ok) {
        const decoder = new TextDecoder();
        return decoder.decode(standard_output).trim();
      } else {
        return def;
      }
    } catch(e) {
      return def;
    }
}

const NordVPNMenuToggle = GObject.registerClass(
  class NordVPNMenuToggle extends QuickMenuToggle {
    constructor() {
      super({
        title: _('NordVPN'),
        gicon: Gio.ThemedIcon.new(ICON_NAME),
        toggleMode: true,
      });

      this.menu.setHeader(
        ICON_NAME,
        spawnCommandLineSync("nordvpn version", _('NordVPN client not found'))
      );

      const selectCountryMenuItem = new PopupSubMenuMenuItem(_('Select country'), true);
      selectCountryMenuItem.icon.set_gicon(getGioIcon("globe"));
      const countries = spawnCommandLineSync(COUNTRIES).split(",");
      countries.forEach((country) => {
        const trimmed = country.trim();
        const gicon = getGioIcon(trimmed);
        selectCountryMenuItem.menu.addAction(
          _(trimmed.replaceAll("_", " ")),
          () => {
            spawnCommandLine(`${CONNECT} ${trimmed}`);
            this.gicon = gicon;
            this.checked = true;
          },
          gicon
        );
      });
      this.menu.addMenuItem(selectCountryMenuItem);

      this.connect('clicked', () => {
        if (this.checked) {
          spawnCommandLine(CONNECT);
        } else {
          spawnCommandLine(DISCONNECT);
          this.gicon = Gio.ThemedIcon.new(ICON_NAME);
        }
      });
    }
  });

const NordVPNIndicator = GObject.registerClass(
  class NordVPNIndicator extends SystemIndicator {
    constructor() {
      super();

      this._indicator = this._addIndicator();

      const toggle = new NordVPNMenuToggle();
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
    this._indicator = new NordVPNIndicator();
    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
  }

  disable() {
    this._indicator.quickSettingsItems.forEach(item => item.destroy());
    this._indicator.destroy();
  }
}
