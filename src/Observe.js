import GlobalEmitter from './GlobalEmitter';
import {getRegisteredMutations, getRegisteredActions, trimNamespace} from './utils/vuex';
import defaults from './defaults';
import {SYSTEM_EVENTS} from './constants';
import {
    unwrapIfSingle,
    prefixWith,
    pipe,
    augmentMethod,
} from './utils';

export default (Socket, {store, ...otherOptions} = {}) => {
    const options = {...defaults, ...otherOptions};

    const eventToAction = pipe(
        options.eventToActionTransformer,
        prefixWith(options.actionPrefix),
    );

    const eventToMutation = pipe(
        options.eventToMutationTransformer,
        prefixWith(options.mutationPrefix),
    );

    function passToStore(event, payload) {
        if (!store) return;

        const desiredMutation = eventToMutation(event);
        const desiredAction = eventToAction(event);
        const mutations = getRegisteredMutations(store);
        const actions = getRegisteredActions(store);
        const unwrappedPayload = unwrapIfSingle(payload);

        mutations
            .filter((namespacedMutation) => {

                    if (options.mutation ? options.mutation[event] : undefined) {
                        return options.mutation[event] === namespacedMutation;
                    }

                    return trimNamespace(namespacedMutation) === desiredMutation;
                }
            )
            .forEach((namespacedMutation) => store.commit(namespacedMutation, unwrappedPayload));

        actions
            .filter((namespacedAction) => {
                    if (options.action ? options.action[event] : undefined) {
                        return options.action[event] === namespacedAction;
                    }

                    return trimNamespace(namespacedAction) === desiredAction;
                }
            )
            .forEach((namespacedAction) => store.dispatch(namespacedAction, unwrappedPayload));
    }

    function registerEventHandler() {
        augmentMethod(Socket, 'onevent', (packet) => {
            const [eventName, ...args] = packet.data;
            let mappedEventName = eventName;

            if (otherOptions.eventMapping) {
                mappedEventName = otherOptions.eventMapping(eventName, args);
            }

            GlobalEmitter.emit(mappedEventName, ...args);
            passToStore(mappedEventName, args);
        });

        SYSTEM_EVENTS.forEach((eventName) => {
            Socket.on(eventName, (...args) => {
                GlobalEmitter.emit(eventName, ...args);
                passToStore(eventName, args);
            });
        });
    }

    registerEventHandler();
};
