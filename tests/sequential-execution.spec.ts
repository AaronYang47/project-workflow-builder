import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { createExecutionItem } from "../src/lib/execution";
import { sequentialExecutionBlocker, getWorkflowProgress } from "../src/lib/workflow-progress";
import { useWorkflowStore } from "../src/store/workflow-store";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function fixture() {
 const file=createProjectWorkflow("Sequential execution");
 file.graph.nodes=["first","second"].map((id,index)=>{
  const node=createDomainNode("general",id);
  node.title=`Chapter ${index+1}`;
  node.metadata.executionOrder="strict-sequential";
  node.conditions=[{id:`condition-${id}`,label:`Finish ${id}`,required:true,checked:false,linkedExecutionItemId:`task-${id}`}];
  file.layout.nodes[id]={nodeId:id,x:index*660,y:100,width:384,height:500};
  return node;
 });
 file.graph.edges=[{id:"sequence",source:"first",target:"second",sourceHandle:"out",targetHandle:"in",type:"success",label:"",lineStyle:"solid",arrowStyle:"closed",customFields:{}}];
 file.execution!.items=["first","second"].map(id=>createExecutionItem(`task-${id}`,id,"Task"));
 return file;
}

test("L2 and L3 completion cannot bypass the preceding chapter",()=>{
 useWorkflowStore.getState().replaceFile(fixture());
 const store=useWorkflowStore.getState;
 store().updateExecutionItem("task-second",{checklistComplete:true});
 expect(store().file.execution!.items.find(i=>i.id==="task-second")!.checklistComplete).not.toBe(true);
 store().updateNode("second",{conditions:[{...store().file.graph.nodes.find(n=>n.id==="second")!.conditions[0],checked:true}]});
 expect(store().file.graph.nodes.find(n=>n.id==="second")!.conditions[0].checked).toBe(false);
 expect(sequentialExecutionBlocker(store().file,"second")).toBeTruthy();
 store().updateExecutionItem("task-first",{checklistComplete:true});
 expect(sequentialExecutionBlocker(store().file,"second")).toBeTruthy();
 store().updateNode("first",{conditions:[{...store().file.graph.nodes.find(n=>n.id==="first")!.conditions[0],checked:true}]});
 expect(sequentialExecutionBlocker(store().file,"second")).toBeUndefined();
 store().updateExecutionItem("task-second",{checklistComplete:true});
 expect(store().file.execution!.items.find(i=>i.id==="task-second")!.checklistComplete).toBe(true);
 expect([...getWorkflowProgress(store().file.graph.nodes,store().file.graph.edges,store().file.execution!.items,store().file.operations).reachedNodeIds]).toEqual(expect.arrayContaining(["first","second"]));
});

test("strict ordering is opt-in and does not lock other workflows",()=>{
 const file=fixture();
 file.graph.nodes[1].metadata={};
 expect(sequentialExecutionBlocker(file,"second")).toBeUndefined();
});

test("L3 visibly explains the lock and disables premature completion",async({page})=>{
 await page.addInitScript(({key,file})=>localStorage.setItem(key,JSON.stringify({state:{file,workspaceOwnerId:"dev-bypass",dirty:false},version:0})),{key:WORKFLOW_STORAGE_KEY,file:fixture()});
 await page.goto("/");
 await page.getByRole("button",{name:"L2 · Detailed Workflow",exact:true}).click();
 await page.locator('[data-id="second"]').getByRole("button",{name:"Open L3 details for release condition 1",exact:true}).click();
 await expect(page.getByText("Complete the preceding chapter and its required release conditions before completing this chapter.",{exact:true})).toBeVisible();
 await expect(page.getByRole("checkbox",{name:/Required file:/})).toBeDisabled();
});
