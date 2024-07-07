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
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { PopupSubMenuMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { spawnCommandLine } from 'resource:///org/gnome/shell/misc/util.js';

const connect = "nordvpn connect";
const disconnect = "nordvpn disconnect";

const countries = [
  "Albania",
  "Algeria",
  "Andorra",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bangladesh",
  "Belgium",
  "Belize",
  "Bermuda",
  "Bhutan",
  "Bolivia",
  "Bosnia_And_Herzegovina",
  "Brazil",
  "Brunei_Darussalam",
  "Bulgaria",
  "Germany",
  "Japan",
  "Singapore",
  "United_States"
];

const NordVPNMenuToggle = GObject.registerClass(
  class NordVPNMenuToggle extends QuickMenuToggle {
    constructor() {
      super({
        title: _('NordVPN'),
        iconName: 'nordvpn-tray-white',
        toggleMode: true,
      });
      
      let subMenuItem = new PopupSubMenuMenuItem(_('Select country'));
      countries.forEach((country) => {
        const ext = Extension.lookupByURL(import.meta.url)
        const file = ext.dir.resolve_relative_path(`icons/${country}.svg`);
        subMenuItem.menu.addAction(
          _(country.replace("_", " ")),
          () => {
            spawnCommandLine(`${connect} ${country}`);
            this.set_checked(true);
          },
          new Gio.FileIcon({ file })
        );
      });
      
      this.menu.addMenuItem(subMenuItem);
      
      this.connect('clicked', () => {
        if (this.get_checked()) {
          spawnCommandLine(connect);
        } else {
          spawnCommandLine(disconnect);
        }
      });
    }
    
    buildMenuItem(country) {
      const ext = Extension.lookupByURL(import.meta.url);
      const file = ext.dir.resolve_relative_path(`icons/${country}.svg`);
      this.menu.addAction(
        _(country.replace("_", " ")),
        () => {
          spawnCommandLine(`${connect} ${country}`);
          this.set_checked(true);
        },
        new Gio.FileIcon({ file })
      );
    }
  });

const NordVPNIndicator = GObject.registerClass(
  class NordVPNIndicator extends SystemIndicator {
    constructor() {
      super();

      this._indicator = this._addIndicator();
      this._indicator.iconName = 'nordvpn-tray-blue';

      const toggle = new NordVPNMenuToggle();
      toggle.bind_property('checked',
        this._indicator, 'visible',
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
