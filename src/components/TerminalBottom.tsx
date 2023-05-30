import type {FormEvent, KeyboardEvent} from "react";
import TextareaAutosize from 'react-textarea-autosize';
// import {debounce} from "../helpers";
// import {OpenAIApi, Configuration} from "openai";
import {useEffect, useRef, useState} from "react";

type History = {
    ts: number
    user: {
        command: string
        role: string
    }
    assistant?: {
        replies: string
        role: string
    },
    isLast?: boolean
}

const commands: string[] = ["clear", "history", "exit", "help", "cls"];

export function TerminalBottom() {
    const [sug, setSug] = useState<string>('');
    const [prompt, setPrompt] = useState<string>('');
    const [histories, setHistories] = useState<History[]>([]);
    const [processing, setProc] = useState<boolean>(false);
    const [tokens, setTokens] = useState<string>('');
    const c_tRef = useRef<AbortController>(new AbortController());
    const [isReq, setReq] = useState<boolean>(false);
    const t_a_ref = useRef<HTMLTextAreaElement>(null);
    const con_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // document.addEventListener('keydown', ev => {
        //     console.log(histories);
        //     if (ev.ctrlKey && ev.key === 'c') {
        //         // console.log('test')
        //         console.log(histories);
        //         c_tRef.current.abort();
        //         c_tRef.current = new AbortController();
        //         setProc(false);
        //         setReq(false);
        //     }
        // });
        return () => {
            c_tRef.current.abort();
        }
    }, []);

    useEffect(() => {
        if (con_ref.current) {
            con_ref.current.scrollTop = con_ref.current.scrollHeight;
        }
    }, [histories]);

    // const configuration = new Configuration({
    //     apiKey: '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'
    // })

    // https://api.openai.com/v1/chat/completions
    const apiUrl = 'https://thoughtflow.org/reverse/v1/chat/completions';

    const fetchOptions = {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer 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`,
            'test': 'test'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{role: "user", content: prompt}],
            temperature: 0.6,
            stream: true,
            //    stop: ['\n'],
        }),
    };

    function handleInput(e: FormEvent) {
        const t = e.target as HTMLInputElement;

        // auto suggestion
        const f_v = commands.find(_ => _.startsWith(t.value));

        if (f_v && t.value) {
            setSug(f_v);
        } else {
            setSug('');
        }

        setPrompt(t.value);
    }

    async function handlePress(e: KeyboardEvent<HTMLTextAreaElement>) {
        /**
         * !isReq && !processing 防止在 Enter 后有意无意的继续 Enter 导致的 State 和 请求问题
         */
        if (!isReq && !processing && !e.shiftKey && !e.nativeEvent.isComposing && e.key === 'Enter') {
            e.preventDefault();
            // const t = e.target as HTMLInputElement;
            switch (prompt) {
                case "help":
                    setSug('');
                    break;
                case "history":
                    setSug('');
                    break;
                case "exit":
                    setSug('');
                    break;
                case 'clear':
                    setSug('');
                    setHistories([]);
                    break;
                case '':
                    // setHistories([...histories, {command: `${prompt}`, content: false}]);
                    break;
                default:
                    // setHistories([...histories, {command: `${prompt}`, content: true}]);
                    setProc(true);
                    setReq(true);
                    const his_copy = histories;

                    try {

                        setHistories([...histories, {
                            ts: +new Date(),
                            user: {
                                command: prompt,
                                role: 'user'
                            },
                            assistant: {
                                role: 'assistant',
                                replies: ''
                            },
                            isLast: true
                        }]);

                        // try {
                        //     const old_rcs: History[] = JSON.parse(localStorage.getItem('store')) || [];
                        //     localStorage.setItem('store', JSON.stringify([...old_rcs, {
                        //         ts: +new Date(),
                        //         user: {
                        //             command: prompt,
                        //             role: 'user'
                        //         },
                        //         assistant: {
                        //             role: 'assistant',
                        //             replies: ''
                        //         }
                        //     }]));
                        // } catch (e) {
                        //     console.log(e.message);
                        // }
                        const {body} = await fetch(apiUrl, {...fetchOptions, signal: c_tRef.current.signal});

                        setReq(false);
                        const d = new TextDecoder('utf8');
                        const reader = await body.getReader();
                        let fullText = ''

                        while (true) {
                            const {value, done} = await reader.read();
                            if (done) { // stream end
                                setTokens('');
                                setProc(false);
                                const old_store: History[] = JSON.parse(localStorage.getItem('store')) || [];
                                const new_rc = {
                                    ts: +new Date(),
                                    user: {
                                        command: prompt,
                                        role: 'user'
                                    },
                                    assistant: {
                                        role: 'assistant',
                                        replies: fullText
                                    }
                                };

                                localStorage.setItem('store', JSON.stringify([...old_store, new_rc]));
                                new_rc['isLast'] = false;
                                setHistories([...histories, new_rc]);

                                break;
                            } else {
                                const decodedString = d.decode(value);
                                try {
                                    //fixes string not json-parseable otherwise
                                    let splits: string[] = decodedString.split('data: ');
                                    splits = splits.filter(_ => _ !== '');
                                    splits.forEach(_ => {
                                        const text: string = JSON.parse(_).choices[0].delta.content || '';
                                        fullText += text;
                                        setTokens(fullText);
                                    })
                                } catch (e) {
                                    // the last line is data: [DONE] which is not parseable either, so we catch that.
                                    console.log('done');
                                }
                            }
                        }
                    } catch (err) {
                        console.log(err.message);
                    }
                    break;
            }
            setPrompt('');
        } else if (isReq || processing && e.ctrlKey && e.key === 'c') {
            const old_rc = JSON.parse(localStorage.getItem('store')) || [];
            const copy = [...histories];
            const last = copy?.length - 1;
            copy[last].assistant.replies = tokens;
            localStorage.setItem('store', JSON.stringify([...old_rc, copy[last]]));
            copy[last].isLast = false;
            setHistories([...copy]);
            setTokens('');
            setPrompt('');
            c_tRef.current.abort();
            c_tRef.current = new AbortController();
            setProc(false);
            setReq(false);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            sug && setPrompt(sug);
        }
    }

    return (
        <div ref={con_ref} onClick={e => {
            // console.log(e.target)
            e.preventDefault();
            e.target === e.currentTarget && t_a_ref.current && t_a_ref.current.focus();
        }} className='ml-2 text-white mr-2 h-[calc(100%-1.8rem)] overflow-x-hidden overflow-y-auto rm-sc'>
            <div className='inline-block mt-0.5'>
                Last login: Sun May 7 23:19:46 on Chrome
            </div>
            <div className='flex flex-col relative mb-1'>
                {histories.map((_, i) => {
                    return <div key={_?.ts + i}>
                        <div className='flex items-start'>
                            <div className='flex items-center justify-center mr-2'>
                                <span>root@sh#</span>
                                <div
                                    className='relative flex ml-4 mr-2 bg-triangle w-6 h-4 items-center justify-center a_f'>
                                    <div className='absolute left-[-.5rem]'>
                                        <div className='t_t'></div>
                                        <div className='b_t'></div>
                                    </div>
                                    <span className='text-gray-800'>~</span>
                                </div>
                            </div>
                            <span>{_?.user.command}</span>
                        </div>
                        {/*to-do: Memo 优化 markdown replies*/}
                        <main className=''
                              dangerouslySetInnerHTML={{__html: _?.isLast ? tokens : _?.assistant.replies}}></main>
                    </div>
                })}
                <div style={{position: processing ? 'absolute' : 'static', zIndex: processing ? '-1' : '1', bottom: 0}}
                     className='flex items-start w-[100%]'>
                    <div className='relative flex items-center justify-center'>
                        <span>root@sh#</span>
                        <div className='relative flex ml-4 mr-2 bg-triangle w-6 h-4 items-center justify-center a_f'>
                            <div className='absolute left-[-.5rem]'>
                                <div className='t_t'></div>
                                <div className='b_t'></div>
                            </div>
                            <span className='text-gray-800'>~</span>
                        </div>
                    </div>
                    <div className='flex-1 relative'>
                        <span className='absolute left-2 opacity-70 z-0'>{sug}</span>
                        <TextareaAutosize ref={t_a_ref} value={prompt} onInput={handleInput} onKeyDown={handlePress}
                                          autoFocus
                                          className='w-[100%] flex-1 ml-2 caret-w-2 resize-none focus:outline-none bg-transparent'>
                        </TextareaAutosize>
                    </div>
                </div>
            </div>
            {isReq && <div className='w-[6px] h-[20px] bg-white animate-breath'></div>}
        </div>
    );
}