import json, multiprocessing as mp, os, time
import torch
from torch.utils.data import DataLoader, TensorDataset

def child(q):
    q.put(torch.cuda.is_available())

def main():
    assert torch.cuda.is_available()
    device=torch.device('cuda'); before=torch.cuda.memory_allocated()
    started=time.time(); x=torch.randn((4096,4096),device=device); y=x@x; torch.cuda.synchronize()
    loader=DataLoader(TensorDataset(torch.arange(128)),batch_size=16,num_workers=2)
    batches=sum(1 for _ in loader)
    ctx=mp.get_context('spawn'); q=ctx.Queue(); ps=[ctx.Process(target=child,args=(q,)) for _ in range(2)]
    [p.start() for p in ps]; children=[q.get(timeout=30) for _ in ps]; [p.join(30) for p in ps]; assert all(p.exitcode==0 for p in ps) and all(children)
    path='/checkpoints/rl-smoke.pt'; torch.save({'tensor':y[0,:16].cpu(),'version':str(torch.__version__)},path); restored=torch.load(path,weights_only=True); assert restored['tensor'].shape[0]==16
    peak=torch.cuda.max_memory_allocated(); result=float(y[0,0]); del x,y; torch.cuda.empty_cache(); after=torch.cuda.memory_allocated()
    print(json.dumps({'python':os.sys.version.split()[0],'torch':torch.__version__,'cuda_runtime':torch.version.cuda,'cudnn':torch.backends.cudnn.version(),'device':torch.cuda.get_device_name(0),'result':result,'dataloader_batches':batches,'multiprocessing':children,'checkpoint':path,'memory_before':before,'memory_peak':peak,'memory_after_cleanup':after,'seconds':time.time()-started},indent=2))
if __name__=='__main__': main()