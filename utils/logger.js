import { Logger } from 'werelogs';
import _config from '../Config';

export default new Logger('Utapi', {
    level: _config.log.logLevel,
    dump: _config.log.dumpLevel,
});
