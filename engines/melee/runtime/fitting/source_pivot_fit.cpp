// Uniform source-shape fitting only. Animation stays in the opt-in OSSK2 renderer.
#include <cmath>
#include <cstdint>
#include <algorithm>
#include <limits>
extern "C" int fit_source_pivot(unsigned n,unsigned count,const double* p,const double* normals,
 const double* weights,const uint32_t* joints,const double* origins,const double* anchors,double visibleHeight,
 double* out,double* outNormals,uint32_t* outJoints,float* outWeights,double* outOrigins) {
 if(!n||n>65535||count!=39)return 1;
 double low=std::numeric_limits<double>::infinity(),high=-low;
 for(unsigned i=0;i<n;i++)for(int k=0;k<3;k++){
  double value=p[i*3+k];if(!std::isfinite(value))return 2;
  if(k==1){low=std::min(low,value);high=std::max(high,value);}
 }
 double ground=0;
 double scale=visibleHeight/(high-low);
 if(!std::isfinite(ground)||!std::isfinite(scale)||scale<=0||visibleHeight>50||high-low<1e-6)return 3;
 auto transform=[&](const double* point,double* result){result[0]=-point[2]*scale;result[1]=(point[1]-low)*scale+ground;result[2]=point[0]*scale;};
 for(unsigned i=0;i<count;i++){
  for(int k=0;k<3;k++)if(!std::isfinite(origins[i*3+k]))return 4;
  transform(origins+i*3,outOrigins+i*3);
 }
 for(unsigned i=0;i<n;i++){
  transform(p+i*3,out+i*3);
  double length=std::hypot(normals[i*3],std::hypot(normals[i*3+1],normals[i*3+2]));
  if(!std::isfinite(length)||length<1e-8)return 5;
  outNormals[i*3]=-normals[i*3+2]/length;outNormals[i*3+1]=normals[i*3+1]/length;outNormals[i*3+2]=normals[i*3]/length;
  double sum=0;for(int k=0;k<4;k++){
   unsigned at=i*4+k;if(joints[at]>=count||!std::isfinite(weights[at])||weights[at]<0)return 6;
   sum+=weights[at];
  }
  if(!std::isfinite(sum)||sum<1e-8)return 7;
  for(int k=0;k<4;k++){unsigned at=i*4+k;outJoints[at]=joints[at];outWeights[at]=float(weights[at]/sum);}
 }
 return 0;
}
