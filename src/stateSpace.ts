/**
 * @author Robin Sun
 * @email robin@naturewake.com
 * @create date 2019-07-10 11:13:27
 * @modify date 2019-07-10 11:13:27
 * @desc [description]
 */

export enum ActionStatus {
    doing = 'doing', 
    done = 'done', 
    error = 'error',
    idle = 'idle'
}

export interface KeyValue {
    [key:string]:any
}

export const getActionNameByStatus = (actionName: string, status: string):string => {
    const statusValue = (status in Object.keys(ActionStatus)) ? ActionStatus[status as keyof typeof ActionStatus] : status
    return `${actionName}.$${statusValue}`
}

export const getActionStatusByName = (actionName: string):ActionStatus|null => {
    let result = null
    if (actionName.indexOf('.$')>0) {
        const parts = actionName.split('.$')
        if (parts.length === 2) {
            const statusValue = parts[1]
            result = ActionStatus[statusValue as keyof typeof ActionStatus]
        }
    }
    return result
}

export const getPropPath = (parentPath: string, propName: string) => {
    return parentPath ? parentPath + '.' + propName : propName
}

interface identifyStateByAbsolutePathParam {
    state: KeyValue
    path?: string
    returnValue?: boolean
    customName?: string
}
const identifyStateByAbsolutePath = ({state = {}, path, returnValue = false, customName = ''}: identifyStateByAbsolutePathParam) => {
    if (!path && !customName) return state
    
    const result: KeyValue = {}
    if (!path && customName) {
        if (returnValue) return state
        result[customName] = state
    } else { // if (path)
        let segments = path!.split('.')
        let parent = state
        for (let i = 0; i < segments.length - 1; i++) {
            parent = parent[segments[i]] || {}
        }
        const originalName = segments[segments.length - 1]

        if (returnValue) return parent[originalName]

        if (!customName) result[originalName] = parent[originalName]
        else result[customName] = parent[originalName]
    }
    return result
}

export class ActionScope {
    path: string
    actionCache: KeyValue
    originalHandlers: KeyValue
    actionCount: number
    bindCache: KeyValue
    segmentsCache: string[]
    constructor(currentPath: string, originalActions: KeyValue) {
        this.path = currentPath
        this.segmentsCache = currentPath.split('.')
        const actionNameArray = Object.keys(originalActions)
        this.actionCount = actionNameArray.length
        this.actionCache = {}
        this.bindCache = {}
        this.originalHandlers = {}
        if (this.actionCount > 0) {
            for (let actionName of actionNameArray) {
                this.actionCache[actionName] = originalActions[actionName]
                this.originalHandlers[actionName] = originalActions[actionName]
                this.bindCache[actionName] = this.actionCache
            }
        }
    }

    bind(obj: any) {
        if (!this.actionCount) return
        if (!obj) return
        if (typeof obj !== 'object') return
        if (Object.keys(obj).length === 0) return
        this.bindCache = Object.assign({}, this.actionCache, obj)
    }

    getAction(actionName: string, original: boolean = false) {
        const action = original? this.originalHandlers[actionName] : this.actionCache[actionName]
        return action
    }

    hasAction(actionName: string) {
        if (this.actionCache[actionName]) return true
        return false
    }
}

export const isIdentity = (path: string): boolean => {
    if (path && path.length > 1) return path[0] === '#'
    return false
}

export const mergeStateToProps = (currentPath: string,  combines: any, actionScope: ActionScope, namedPathCache: Map<string, string>) => {
    // mapStateToProps?: (state, ownProps?) => Object
    return (state: any = {}) => {
        let props = identifyStateByAbsolutePath({state, path: currentPath, returnValue: true})
        if (combines) {
            let combinedPaths = (typeof combines === 'string') ? [combines] : combines
            if (Array.isArray(combinedPaths)) {
                for (let path of combinedPaths) {
                    const absPath = isIdentity(path) ? namedPathCache.get(path) : path
                    const combinedState = identifyStateByAbsolutePath({state, path: absPath})
                    props = Object.assign(props || {}, combinedState)
                }
            } else if (Object.prototype.toString.call(combinedPaths) === '[object Object]') {
                for (let customName in combinedPaths) {
                    const path = combinedPaths[customName]
                    const absPath = isIdentity(path) ? namedPathCache.get(path) : path
                    const combinedState = identifyStateByAbsolutePath({state, path: absPath, customName})
                    props = Object.assign(props || {}, combinedState)
                }
            }
        }
        props = props || {};
        if (actionScope) actionScope = actionScope
        return props
    }
}
export const mergeDispatchToProps = (customDispatcher: any, currentPath: string, actionScope: ActionScope) => {
    // mapDispatchToProps?: Object | (dispatch, ownProps?) => Object
    if (!actionScope) return () => ({})
    const actionNameSet = Object.keys(actionScope.actionCache)
    if (actionNameSet.length === 0) return () => ({})
    return (dispatch: any) => {
        const dispatchers: KeyValue = {};
        for (let actionName of actionNameSet) {
            const actionPath = getPropPath(currentPath, actionName)
            dispatchers[actionName] = (...params: any[]) => {
                return customDispatcher(actionPath , ...params);
            }
            dispatchers[actionName].idle = () => {
                const idlePath = getActionNameByStatus(actionPath, ActionStatus.idle)
                const data:KeyValue = {}
                data[`${actionName}$status`] = 'idle'
                return dispatch({type: idlePath, data})
            }
            actionScope.actionCache[actionName] = dispatchers[actionName]
        }
        return dispatchers;
    }
}

// modified from combineReducers method of official redux package
export function combineSubReducers(currentReducers: any[], subReducers: KeyValue) {
    const subReducerKeys = Object.keys(subReducers)
    return function combination(state:KeyValue = {}, payload: ActionPayload) {
        let hasChanged = false
        let previousState = state, nextState = state
        for (let i = 0; i<currentReducers.length; i++) {
            nextState = currentReducers[i](previousState, payload) || {}
            hasChanged = hasChanged || nextState !== previousState
        }
        let hasSubChanged = false, nextSubState: KeyValue = {}
        for (let i = 0; i < subReducerKeys.length; i++) {
            const key = subReducerKeys[i]
            const reducer = subReducers[key]
            const previousStateForKey = nextState[key]
            const nextStateForKey = reducer(previousStateForKey, payload) || {}
            hasSubChanged = hasSubChanged || nextStateForKey !== previousStateForKey
            if (hasSubChanged) nextSubState[key] = nextStateForKey
        }
        if (!hasChanged && hasSubChanged) return Object.assign({}, state, nextSubState)
        if (hasChanged && !hasSubChanged) return nextState
        if (hasChanged && hasSubChanged) return Object.assign(nextState, nextSubState)
        return state
    }
}

export interface ActionPayload { type: string, data: string}
export const createNaiveReducer = (currentPath: string, actionKeys: string[], initState: any) => {
    const actionKeyCache = new Map<string, boolean>(
        actionKeys.map(actionName => [getPropPath(currentPath, actionName), true])
    )
    return (state = initState, payload: ActionPayload) => {
        if (actionKeyCache.has(payload.type)) {
            return Object.assign({}, state, payload.data)
        }
        return state
    }
}

export enum PropertyType {
    action = 'action',
    property = 'property',
    name = 'name',
    combine = 'combine',
    id = 'id',
    children = 'children',
    view = 'view',
    unknown = 'unknown'
}


export enum ActionType {
    syncFunction = 'syncFunction',
    syncArrowFunction = 'syncArrowFunction',
    asyncFunction = 'asyncFunction',
    asyncArrowFunction = 'asyncArrowFunction',
    generator = 'generator',
    promise = 'promise',
    unknown = 'unknown'
}

const isPrivateKey = (key: any): boolean => {
    return (typeof key === 'string' && key.length > 1 && key[0] === '$')
}

export const checkActionType = (action: any): ActionType => {
    if (!action) return ActionType.unknown
    if (Object.prototype.toString.call(action) === '[object Promise]') return ActionType.promise
    else if (Object.prototype.toString.call(action) === '[object AsyncFunction]') {
        if (action.toString().indexOf('=>') > 0) return ActionType.asyncArrowFunction
        return ActionType.asyncFunction
    } else if (Object.prototype.toString.call(action) === '[object GeneratorFunction]') return ActionType.generator
    else if (Object.prototype.toString.call(action) === '[object Function]') {
        const actionText = action.toString()
        if (actionText.indexOf('async(function') > 0) return ActionType.asyncFunction
        else if (actionText.indexOf('=>') > 0) return ActionType.syncArrowFunction
        return ActionType.syncFunction
    } else return ActionType.unknown
}

export const checkPropertyType = (prop: string, value: any): PropertyType => {
    if (!prop) return PropertyType.unknown
    if (isPrivateKey(prop)) {
        if (prop.toLowerCase() === '$name') return PropertyType.name
        else if (prop.toLowerCase() === '$id') return PropertyType.id
        else if (prop.toLowerCase() === '$combine') return PropertyType.combine
        else if (prop.toLowerCase() === '$children') return PropertyType.children
        else if (prop.toLowerCase() === '$view') return PropertyType.view
        else return PropertyType.unknown
    } else if (checkActionType(value) !== ActionType.unknown) {
        return PropertyType.action
    } else {
        return PropertyType.property
    }
}

