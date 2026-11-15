#include "OZShapes.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "GameFramework/Actor.h"
#include "UObject/UObjectGlobals.h"

UStaticMesh* OZShapes::Mesh(EShape Shape)
{
	static UStaticMesh* Cache[4] = { nullptr, nullptr, nullptr, nullptr };
	const int32 I = (int32)Shape;
	if (!Cache[I])
	{
		static const TCHAR* Paths[4] = {
			TEXT("/Engine/BasicShapes/Cube.Cube"), TEXT("/Engine/BasicShapes/Sphere.Sphere"),
			TEXT("/Engine/BasicShapes/Cylinder.Cylinder"), TEXT("/Engine/BasicShapes/Cone.Cone") };
		Cache[I] = LoadObject<UStaticMesh>(nullptr, Paths[I]);
		if (Cache[I]) Cache[I]->AddToRoot();
	}
	return Cache[I];
}

UMaterialInstanceDynamic* OZShapes::Material(UObject* Outer, const FLinearColor& Color, float Roughness)
{
	static UMaterialInterface* Base = nullptr;
	if (!Base)
	{
		Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
		if (Base) Base->AddToRoot();
	}
	if (!Base) return nullptr;
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, Outer);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	return M;
}

UStaticMeshComponent* OZShapes::AddPart(AActor* Owner, USceneComponent* Parent, EShape Shape, const FVector& Size,
	const FVector& Location, const FLinearColor& Color, const FRotator& Rotation, bool bCastShadow)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(Owner);
	C->SetStaticMesh(Mesh(Shape));
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetGenerateOverlapEvents(false);
	C->SetCastShadow(bCastShadow);
	C->SetMobility(EComponentMobility::Movable);
	C->SetupAttachment(Parent);
	C->SetRelativeLocation(Location);
	C->SetRelativeRotation(Rotation);
	C->SetRelativeScale3D(Size / 100.f);
	if (UMaterialInstanceDynamic* M = Material(C, Color)) C->SetMaterial(0, M);
	C->RegisterComponent();
	return C;
}
