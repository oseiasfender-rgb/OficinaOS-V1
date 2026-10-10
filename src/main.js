import './styles/tokens.css';
import './styles/layout.css';
import './styles/reference-fonts.css';
import './styles/reference-layout.css';
import { boot } from './app/boot.js';
import { registerPwa } from './app/pwa.js';

registerPwa();
boot(document.getElementById('app'));
